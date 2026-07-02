/**
 * Synchronizes normalized Gmail threads with ticket and message repositories.
 * All infrastructure is injected so synchronization behavior can be tested
 * without Google services.
 */
class GmailSyncEngine {
  /**
   * @param {{
   *   gmailGateway: Object,
   *   ticketRepository: Object,
   *   messageRepository: Object,
   *   customerRepository: Object,
   *   attachmentStore: Object,
   *   settings: Object,
   *   idGenerator: function(): string,
   *   clock: function(): Date,
   *   logger: Object,
   *   version: string
   * }} dependencies
   */
  constructor(dependencies) {
    const required = [
      'gmailGateway', 'ticketRepository', 'messageRepository', 'customerRepository', 'attachmentStore',
      'settings', 'idGenerator', 'clock', 'logger', 'version'
    ];
    required.forEach(function(name) {
      if (!dependencies || dependencies[name] == null) {
        throw new Error('Missing GmailSyncEngine dependency: ' + name);
      }
    });
    this.gmail_ = dependencies.gmailGateway;
    this.tickets_ = dependencies.ticketRepository;
    this.messages_ = dependencies.messageRepository;
    this.customers_ = dependencies.customerRepository;
    this.attachments_ = dependencies.attachmentStore;
    this.settings_ = dependencies.settings;
    this.idGenerator_ = dependencies.idGenerator;
    this.clock_ = dependencies.clock;
    this.logger_ = dependencies.logger;
    this.version_ = dependencies.version;
  }

  /**
   * Executes one bounded synchronization pass.
   * @return {{threads: number, createdTickets: number, updatedTickets: number,
   *   createdMessages: number, duplicateMessages: number, attachments: number,
   *   customersUpserted: number, failedThreads: number}}
   */
  synchronize() {
    const mailbox = String(this.settings_.get('SUPPORT_EMAIL', 'support@pocketpiano.com')).toLowerCase();
    const baseQuery = this.settings_.get('SUPPORT_GMAIL_QUERY', 'in:anywhere newer_than:30d');
    const limit = Math.max(1, Math.min(500, Number(this.settings_.get('GMAIL_SYNC_LIMIT', '100')) || 100));
    this.gmail_.assertMailbox(mailbox);

    const query = String(baseQuery).trim() + ' {to:' + mailbox + ' from:' + mailbox + '}';
    const threads = this.gmail_.listThreads(query, limit);
    const summary = {
      threads: threads.length,
      createdTickets: 0,
      updatedTickets: 0,
      createdMessages: 0,
      duplicateMessages: 0,
      attachments: 0,
      customersUpserted: 0,
      failedThreads: 0
    };

    threads.forEach(function(thread) {
      try {
        this.synchronizeThread_(thread, mailbox, summary);
        this.gmail_.markProcessed(thread.id, this.settings_.get('SUPPORT_LABEL', 'PocketPiano/Processed'));
      } catch (error) {
        summary.failedThreads += 1;
        this.logger_.error('Gmail thread synchronization failed.', {
          threadId: thread && thread.id ? thread.id : '',
          error: error && error.message ? error.message : String(error),
          stack: error && error.stack ? error.stack : ''
        });
      }
    }, this);

    this.logger_.info('Gmail synchronization completed.', summary);
    return summary;
  }

  /**
   * @param {{id: string, messages: Array<Object>}} thread
   * @param {string} mailbox
   * @param {Object} summary
   * @private
   */
  synchronizeThread_(thread, mailbox, summary) {
    if (!thread || !thread.id || !Array.isArray(thread.messages) || thread.messages.length === 0) {
      throw new Error('Gmail returned an invalid or empty thread.');
    }

    const orderedMessages = thread.messages.slice().sort(function(left, right) {
      return new Date(left.date).getTime() - new Date(right.date).getTime();
    });
    let ticket = this.tickets_.findByThreadId(thread.id);
    const firstMessage = orderedMessages[0];
    const lastMessage = orderedMessages[orderedMessages.length - 1];
    const customerEmail = GmailSyncEngine.customerEmail_(orderedMessages, mailbox);
    const customerName = GmailSyncEngine.customerName_(orderedMessages, mailbox);
    const customer = customerEmail ? this.customers_.upsertByEmail({
      email: customerEmail,
      name: customerName,
      notes: 'Created or updated from Gmail thread ' + thread.id
    }) : null;
    if (customer) {
      summary.customersUpserted += 1;
    }

    if (!ticket) {
      ticket = this.tickets_.create({
        id: this.idGenerator_(),
        threadId: thread.id,
        status: 'NEW',
        priority: 'NORMAL',
        subject: firstMessage.subject || '(no subject)',
        customerId: customer ? customer.id : '',
        customerEmail: customerEmail,
        createdAt: new Date(firstMessage.date),
        updatedAt: this.clock_(),
        lastMessageAt: new Date(lastMessage.date),
        version: this.version_
      });
      summary.createdTickets += 1;
    }

    let ticketFolderId = ticket.driveFolderId || '';
    orderedMessages.forEach(function(message) {
      if (this.messages_.hasMessage(message.id)) {
        summary.duplicateMessages += 1;
        return;
      }

      const stored = this.attachments_.save(ticket.id, message.id, message.attachments || []);
      ticketFolderId = stored.folderId || ticketFolderId;
      this.messages_.add({
        id: this.idGenerator_(),
        ticketId: ticket.id,
        gmailMessageId: message.id,
        direction: GmailSyncEngine.direction_(message.from, mailbox),
        from: message.from || '',
        to: message.to || '',
        cc: message.cc || '',
        subject: message.subject || '',
        sentAt: new Date(message.date),
        bodyPreview: GmailSyncEngine.preview_(message.plainBody),
        bodyText: GmailSyncEngine.bodyText_(message.plainBody),
        attachmentCount: stored.count,
        driveFolderId: stored.folderId || '',
        createdAt: this.clock_()
      });
      summary.createdMessages += 1;
      summary.attachments += stored.count;
    }, this);

    this.tickets_.updateConversation(ticket, {
      status: GmailSyncEngine.nextStatus_(ticket.status, lastMessage.from, mailbox),
      subject: lastMessage.subject || ticket.subject || '(no subject)',
      customerId: ticket.customerId || (customer ? customer.id : ''),
      customerEmail: ticket.customerEmail || customerEmail,
      updatedAt: this.clock_(),
      lastMessageAt: new Date(lastMessage.date),
      driveFolderId: ticketFolderId,
      version: this.version_
    });
    summary.updatedTickets += 1;
  }

  /** @param {string} from @param {string} mailbox @return {string} @private */
  static direction_(from, mailbox) {
    return GmailSyncEngine.addresses_(from).indexOf(mailbox) !== -1 ? 'OUTBOUND' : 'INBOUND';
  }

  /**
   * @param {Array<Object>} messages
   * @param {string} mailbox
   * @return {string}
   * @private
   */
  static customerEmail_(messages, mailbox) {
    for (let index = 0; index < messages.length; index += 1) {
      const candidates = GmailSyncEngine.addresses_(messages[index].from)
        .concat(GmailSyncEngine.addresses_(messages[index].to));
      const customer = candidates.filter(function(address) { return address !== mailbox; })[0];
      if (customer) {
        return customer;
      }
    }
    return '';
  }

  /**
   * @param {Array<Object>} messages
   * @param {string} mailbox
   * @return {string}
   * @private
   */
  static customerName_(messages, mailbox) {
    for (let index = 0; index < messages.length; index += 1) {
      if (GmailSyncEngine.direction_(messages[index].from, mailbox) === 'INBOUND') {
        return GmailSyncEngine.displayName_(messages[index].from);
      }
    }
    return '';
  }

  /** @param {string} value @return {Array<string>} @private */
  static addresses_(value) {
    const matches = String(value || '').toLowerCase().match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/g);
    return matches || [];
  }

  /** @param {string} value @return {string} @private */
  static displayName_(value) {
    const raw = String(value || '').trim();
    const email = GmailSyncEngine.addresses_(raw)[0] || '';
    const withoutEmail = raw.replace(/<[^>]+>/g, '').replace(email, '').replace(/"/g, '').trim();
    return withoutEmail || '';
  }

  /** @param {*} body @return {string} @private */
  static preview_(body) {
    return String(body || '').replace(/\s+/g, ' ').trim().slice(0, 500);
  }

  /** Preserves readable conversation text within the Sheets cell limit. @param {*} body @return {string} @private */
  static bodyText_(body) {
    return String(body || '').replace(/\r\n/g, '\n').trim().slice(0, 40000);
  }

  /**
   * Reopens resolved conversations when a customer sends a new message.
   * @param {string} currentStatus
   * @param {string} lastFrom
   * @param {string} mailbox
   * @return {string}
   * @private
   */
  static nextStatus_(currentStatus, lastFrom, mailbox) {
    const inbound = GmailSyncEngine.direction_(lastFrom, mailbox) === 'INBOUND';
    if (inbound && (currentStatus === 'RESOLVED' || currentStatus === 'CLOSED')) {
      return 'OPEN';
    }
    return currentStatus || 'NEW';
  }
}

/** Google Apps Script adapter that normalizes Gmail service objects. */
class AppsScriptGmailGateway {
  /**
   * Ensures the effective account owns the support mailbox or alias.
   * @param {string} expectedMailbox
   */
  assertMailbox(expectedMailbox) {
    const effective = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
    const aliases = GmailApp.getAliases().map(function(alias) { return alias.toLowerCase(); });
    if (effective !== expectedMailbox && aliases.indexOf(expectedMailbox) === -1) {
      throw new AppError(
        'This script must run as ' + expectedMailbox + ' or an account that owns that alias.',
        'GMAIL_MAILBOX_MISMATCH',
        {effectiveUser: effective}
      );
    }
  }

  /**
   * @param {string} query
   * @param {number} limit
   * @return {Array<{id: string, messages: Array<Object>}>}
   */
  listThreads(query, limit) {
    return GmailApp.search(query, 0, limit).map(function(thread) {
      return {
        id: thread.getId(),
        messages: thread.getMessages().map(function(message) {
          return {
            id: message.getId(),
            from: message.getFrom(),
            to: message.getTo(),
            cc: message.getCc(),
            subject: message.getSubject(),
            date: message.getDate(),
            plainBody: message.getPlainBody(),
            attachments: message.getAttachments({
              includeInlineImages: false,
              includeAttachments: true
            }).map(function(attachment) {
              return {
                name: attachment.getName(),
                contentType: attachment.getContentType(),
                size: attachment.getSize(),
                blob: attachment.copyBlob()
              };
            })
          };
        })
      };
    });
  }

  /** @param {string} threadId @param {string} labelName */
  markProcessed(threadId, labelName) {
    let label = GmailApp.getUserLabelByName(labelName);
    if (!label) {
      label = GmailApp.createLabel(labelName);
    }
    GmailApp.getThreadById(threadId).addLabel(label);
  }
}

/** Script setting adapter used by the synchronization engine. */
class GmailSyncSettings {
  /** @param {string} key @param {*=} fallback @return {*} */
  get(key, fallback) {
    return AppConfig.getSetting(key, fallback);
  }
}

/**
 * Public synchronization entry point suitable for manual and trigger execution.
 * @return {Object}
 */
function syncGmail() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(APP.LOCK_TIMEOUT_MS)) {
    throw new AppError('Another synchronization is already running.', 'GMAIL_SYNC_LOCK_TIMEOUT');
  }
  try {
    const engine = new GmailSyncEngine({
      gmailGateway: new AppsScriptGmailGateway(),
      ticketRepository: new SheetTicketRepository(),
      messageRepository: new SheetMessageRepository(),
      customerRepository: new SheetCustomerRepository(),
      attachmentStore: new DriveAttachmentStore(),
      settings: new GmailSyncSettings(),
      idGenerator: function() { return TicketNumberService.nextUnlocked_(); },
      clock: function() { return new Date(); },
      logger: AppLogger,
      version: APP_VERSION
    });
    return engine.synchronize();
  } finally {
    lock.releaseLock();
  }
}
