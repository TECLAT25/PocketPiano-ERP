/** Header-aware Sheets repository for ticket lifecycle and discovery. */
class SheetTicketRepository {
  constructor() {
    this.sheet_ = AppConfig.getSheet(APP.SHEETS.TICKETS);
    this.headers_ = this.sheet_.getRange(1, 1, 1, this.sheet_.getLastColumn()).getDisplayValues()[0];
    this.headerIndex_ = {};
    this.headers_.forEach(function(header, index) {
      if (header) this.headerIndex_[header] = index;
    }, this);
    ['Ticket ID', 'Status', 'Priority', 'Subject', 'Customer Email', 'Gmail Thread ID',
      'Created At', 'Updated At', 'Last Message At', 'SLA Due At', 'Drive Folder ID',
      'Tags', 'Version', 'Category'].forEach(function(header) {
      if (this.headerIndex_[header] == null) {
        throw new AppError('Tickets sheet is missing the "' + header + '" column. Run install().', 'TICKET_SCHEMA_OUTDATED', {header: header});
      }
    }, this);
    this.reload_();
  }

  reload_() {
    this.byId_ = {};
    this.byThreadId_ = {};
    this.listAll().forEach(function(ticket) {
      this.byId_[ticket.id] = ticket;
      if (ticket.threadId) this.byThreadId_[ticket.threadId] = ticket;
    }, this);
  }

  findById(id) { return this.byId_[String(id)] || null; }
  findByThreadId(threadId) { return this.byThreadId_[String(threadId)] || null; }

  listAll() {
    if (this.sheet_.getLastRow() <= 1) return [];
    return this.sheet_.getRange(2, 1, this.sheet_.getLastRow() - 1, this.headers_.length)
      .getValues()
      .map(function(row, index) { return this.fromRow_(row, index + 2); }, this);
  }

  create(record) {
    if (!record.id) throw new AppError('Ticket ID is required.', 'TICKET_ID_REQUIRED');
    if (this.findById(record.id)) throw new AppError('Ticket ID already exists: ' + record.id, 'TICKET_DUPLICATE_ID');
    if (record.threadId && this.findByThreadId(record.threadId)) throw new AppError('Gmail thread already has a ticket.', 'TICKET_DUPLICATE_THREAD');

    const createdAt = record.createdAt || new Date();
    const priority = record.priority || 'NORMAL';
    const data = Object.assign({}, record, {
      status: record.status || 'NEW',
      priority: priority,
      category: record.category || 'GENERAL',
      createdAt: createdAt,
      updatedAt: record.updatedAt || createdAt,
      lastMessageAt: record.lastMessageAt || createdAt,
      slaDueAt: record.slaDueAt || TicketPolicy.fromAppConfig().calculateDueAt(createdAt, priority),
      version: record.version || APP_VERSION
    });
    const row = this.emptyRow_();
    SheetTicketRepository.fields_().forEach(function(mapping) {
      if (this.headerIndex_[mapping.header] != null && data[mapping.field] != null) row[this.headerIndex_[mapping.header]] = data[mapping.field];
    }, this);
    this.sheet_.appendRow(row);
    const ticket = this.fromRow_(row, this.sheet_.getLastRow());
    this.byId_[ticket.id] = ticket;
    if (ticket.threadId) this.byThreadId_[ticket.threadId] = ticket;
    return ticket;
  }

  update(ticketId, changes) {
    const ticket = this.findById(ticketId);
    if (!ticket) throw new AppError('Ticket not found: ' + ticketId, 'TICKET_NOT_FOUND', {ticketId: ticketId});
    const row = this.sheet_.getRange(ticket.rowNumber, 1, 1, this.headers_.length).getValues()[0];
    const allowed = ['status', 'priority', 'category', 'subject', 'customerId', 'customerEmail',
      'assignedTo', 'updatedAt', 'lastMessageAt', 'slaDueAt', 'driveFolderId', 'tags', 'version'];
    SheetTicketRepository.fields_().forEach(function(mapping) {
      if (allowed.indexOf(mapping.field) !== -1 && Object.prototype.hasOwnProperty.call(changes, mapping.field)) {
        row[this.headerIndex_[mapping.header]] = changes[mapping.field];
      }
    }, this);
    this.sheet_.getRange(ticket.rowNumber, 1, 1, row.length).setValues([row]);
    const updated = this.fromRow_(row, ticket.rowNumber);
    this.byId_[updated.id] = updated;
    if (updated.threadId) this.byThreadId_[updated.threadId] = updated;
    return updated;
  }

  updateConversation(ticket, changes) {
    const updated = this.update(ticket.id, changes);
    Object.assign(ticket, updated);
    return updated;
  }

  search(criteria) {
    const filters = criteria || {};
    const query = String(filters.query || '').trim().toLowerCase();
    let tickets = this.listAll().filter(function(ticket) {
      if (!SheetTicketRepository.matches_(ticket.status, filters.status)) return false;
      if (!SheetTicketRepository.matches_(ticket.priority, filters.priority)) return false;
      if (!SheetTicketRepository.matches_(ticket.category, filters.category)) return false;
      if (!SheetTicketRepository.matches_(ticket.assignedTo, filters.assignedTo)) return false;
      if (filters.customerEmail && ticket.customerEmail.toLowerCase() !== String(filters.customerEmail).toLowerCase()) return false;
      if (filters.slaBreached === true) {
        const due = ticket.slaDueAt instanceof Date ? ticket.slaDueAt : new Date(ticket.slaDueAt);
        if (['RESOLVED', 'CLOSED'].indexOf(ticket.status) !== -1 || Number.isNaN(due.getTime()) || due >= new Date()) return false;
      }
      if (filters.createdFrom && new Date(ticket.createdAt) < new Date(filters.createdFrom)) return false;
      if (filters.createdTo && new Date(ticket.createdAt) > new Date(filters.createdTo)) return false;
      if (query) {
        const haystack = [ticket.id, ticket.subject, ticket.customerEmail, ticket.customerId, ticket.assignedTo, ticket.tags, ticket.category].join(' ').toLowerCase();
        if (haystack.indexOf(query) === -1) return false;
      }
      return true;
    });

    tickets.sort(function(left, right) { return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(); });
    const total = tickets.length;
    const offset = Math.max(0, Number(filters.offset) || 0);
    const limit = Math.max(1, Math.min(1000, Number(filters.limit) || 100));
    return {items: tickets.slice(offset, offset + limit), total: total, offset: offset, limit: limit};
  }

  emptyRow_() { return this.headers_.map(function() { return ''; }); }

  fromRow_(row, rowNumber) {
    const ticket = {rowNumber: rowNumber};
    SheetTicketRepository.fields_().forEach(function(mapping) {
      const index = this.headerIndex_[mapping.header];
      ticket[mapping.field] = index == null ? '' : row[index];
    }, this);
    ['id', 'status', 'priority', 'category', 'subject', 'customerId', 'customerEmail', 'threadId', 'assignedTo', 'driveFolderId', 'tags', 'version'].forEach(function(field) {
      ticket[field] = String(ticket[field] || '');
    });
    return ticket;
  }

  static matches_(actual, expected) {
    if (expected == null || expected === '') return true;
    const values = Array.isArray(expected) ? expected : [expected];
    return values.map(function(value) { return String(value).toUpperCase(); }).indexOf(String(actual).toUpperCase()) !== -1;
  }

  static fields_() {
    return [
      {field: 'id', header: 'Ticket ID'}, {field: 'status', header: 'Status'}, {field: 'priority', header: 'Priority'},
      {field: 'subject', header: 'Subject'}, {field: 'customerId', header: 'Customer ID'}, {field: 'customerEmail', header: 'Customer Email'},
      {field: 'threadId', header: 'Gmail Thread ID'}, {field: 'assignedTo', header: 'Assigned To'}, {field: 'createdAt', header: 'Created At'},
      {field: 'updatedAt', header: 'Updated At'}, {field: 'lastMessageAt', header: 'Last Message At'}, {field: 'slaDueAt', header: 'SLA Due At'},
      {field: 'driveFolderId', header: 'Drive Folder ID'}, {field: 'tags', header: 'Tags'}, {field: 'version', header: 'Version'}, {field: 'category', header: 'Category'}
    ];
  }
}

/** Sheets-backed message repository indexed by immutable Gmail message ID. */
class SheetMessageRepository {
  constructor() {
    this.sheet_ = AppConfig.getSheet(APP.SHEETS.MESSAGES);
    this.headers_ = this.sheet_.getRange(1, 1, 1, this.sheet_.getLastColumn()).getDisplayValues()[0];
    this.headerIndex_ = {};
    this.headers_.forEach(function(header, index) { if (header) this.headerIndex_[header] = index; }, this);
    this.gmailMessageIds_ = {};
    if (this.sheet_.getLastRow() > 1) {
      this.sheet_.getRange(2, 3, this.sheet_.getLastRow() - 1, 1).getDisplayValues()
        .forEach(function(row) { if (row[0]) this.gmailMessageIds_[row[0]] = true; }, this);
    }
  }

  hasMessage(gmailMessageId) { return Boolean(this.gmailMessageIds_[String(gmailMessageId)]); }

  add(record) {
    if (this.hasMessage(record.gmailMessageId)) return;
    const row = this.headers_.map(function() { return ''; });
    SheetMessageRepository.fields_().forEach(function(mapping) {
      if (this.headerIndex_[mapping.header] != null && record[mapping.field] != null) {
        row[this.headerIndex_[mapping.header]] = record[mapping.field];
      }
    }, this);
    this.sheet_.appendRow(row);
    this.gmailMessageIds_[String(record.gmailMessageId)] = true;
  }

  updateTranslation(messageId, originalLanguage, translatedBodyEs) {
    if (!messageId) return;
    const idColumn = this.headerIndex_['Message ID'];
    const langColumn = this.headerIndex_['Original Language'];
    const translatedColumn = this.headerIndex_['Translated Body ES'];
    if (idColumn == null || langColumn == null || translatedColumn == null) {
      throw new AppError('Messages sheet translation columns are missing. Run install().', 'MESSAGE_TRANSLATION_SCHEMA_OUTDATED');
    }
    const lastRow = this.sheet_.getLastRow();
    if (lastRow <= 1) return;
    const ids = this.sheet_.getRange(2, idColumn + 1, lastRow - 1, 1).getDisplayValues();
    for (let index = 0; index < ids.length; index += 1) {
      if (String(ids[index][0]) === String(messageId)) {
        const rowNumber = index + 2;
        this.sheet_.getRange(rowNumber, langColumn + 1).setValue(originalLanguage || '');
        this.sheet_.getRange(rowNumber, translatedColumn + 1).setValue(translatedBodyEs || '');
        return;
      }
    }
  }

  static fields_() {
    return [
      {field: 'id', header: 'Message ID'}, {field: 'ticketId', header: 'Ticket ID'}, {field: 'gmailMessageId', header: 'Gmail Message ID'},
      {field: 'direction', header: 'Direction'}, {field: 'from', header: 'From'}, {field: 'to', header: 'To'}, {field: 'cc', header: 'Cc'},
      {field: 'subject', header: 'Subject'}, {field: 'sentAt', header: 'Sent At'}, {field: 'bodyPreview', header: 'Body Preview'},
      {field: 'attachmentCount', header: 'Attachment Count'}, {field: 'driveFolderId', header: 'Drive Folder ID'}, {field: 'createdAt', header: 'Created At'},
      {field: 'bodyText', header: 'Body Text'}, {field: 'originalLanguage', header: 'Original Language'}, {field: 'translatedBodyEs', header: 'Translated Body ES'}
    ];
  }
}

/** Idempotent Drive attachment persistence, partitioned by ticket. */
class DriveAttachmentStore {
  constructor() { this.root_ = null; }

  save(ticketId, gmailMessageId, attachments) {
    if (!attachments.length) return {folderId: '', count: 0};
    const folder = this.ticketFolder_(ticketId);
    let stored = 0;
    attachments.forEach(function(attachment, index) {
      const original = DriveAttachmentStore.safeName_(attachment.name || 'attachment');
      const fileName = gmailMessageId + '_' + (index + 1) + '_' + original;
      if (!folder.getFilesByName(fileName).hasNext()) folder.createFile(attachment.blob).setName(fileName);
      stored += 1;
    });
    return {folderId: folder.getId(), count: stored};
  }

  ticketFolder_(ticketId) {
    const root = this.rootFolder_();
    const folders = root.getFoldersByName(ticketId);
    return folders.hasNext() ? folders.next() : root.createFolder(ticketId);
  }

  rootFolder_() {
    if (this.root_) return this.root_;
    const id = AppConfig.getProperties().getProperty(APP.PROPERTY_KEYS.DRIVE_FOLDER_ID);
    if (!id) throw new AppError('The application Drive folder is not configured. Run install().', 'DRIVE_NOT_CONFIGURED');
    this.root_ = DriveApp.getFolderById(id);
    return this.root_;
  }

  static safeName_(name) {
    return String(name).replace(/[\/:*?"<>|\u0000-\u001F]/g, '_').slice(0, 180);
  }
}
