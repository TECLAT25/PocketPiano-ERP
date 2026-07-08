/** Immutable application constants. @const */
const APP = Object.freeze({
  NAME: 'PocketPiano ERP',
  VERSION: '2.2.0',
  LOCK_TIMEOUT_MS: 30000,
  LOG_RETENTION_DAYS: 90,
  PROPERTY_KEYS: Object.freeze({
    SPREADSHEET_ID: 'POCKETPIANO_SPREADSHEET_ID',
    DRIVE_FOLDER_ID: 'POCKETPIANO_DRIVE_FOLDER_ID',
    INSTALLED_VERSION: 'POCKETPIANO_INSTALLED_VERSION'
  }),
  SHEETS: Object.freeze({
    DASHBOARD: 'Dashboard',
    TICKETS: 'Tickets',
    MESSAGES: 'Messages',
    CUSTOMERS: 'Customers',
    PRODUCTS: 'Products',
    TEMPLATES: 'Templates',
    SETTINGS: 'Settings',
    LOGS: 'Logs'
  }),
  LOG_LEVELS: Object.freeze({DEBUG: 'DEBUG', INFO: 'INFO', WARN: 'WARN', ERROR: 'ERROR'})
});

/**
 * Append-only persistence schemas. Existing columns require a migration before
 * they may be renamed or removed.
 * @const
 */
const SHEET_SCHEMAS = Object.freeze([
  Object.freeze({name: 'Dashboard', headers: Object.freeze(['Metric', 'Value', 'Updated At']), color: '#1A73E8'}),
  Object.freeze({name: 'Tickets', headers: Object.freeze([
    'Ticket ID', 'Status', 'Priority', 'Subject', 'Customer ID', 'Customer Email',
    'Gmail Thread ID', 'Assigned To', 'Created At', 'Updated At', 'Last Message At',
    'SLA Due At', 'Drive Folder ID', 'Tags', 'Version', 'Category'
  ]), color: '#D93025'}),
  Object.freeze({name: 'Messages', headers: Object.freeze([
    'Message ID', 'Ticket ID', 'Gmail Message ID', 'Direction', 'From', 'To', 'Cc',
    'Subject', 'Sent At', 'Body Preview', 'Attachment Count', 'Drive Folder ID', 'Created At', 'Body Text'
  ]), color: '#F9AB00'}),
  Object.freeze({name: 'Customers', headers: Object.freeze([
    'Customer ID', 'Email', 'Name', 'Phone', 'Locale', 'Company', 'Created At', 'Updated At', 'Notes'
  ]), color: '#188038'}),
  Object.freeze({name: 'Products', headers: Object.freeze([
    'Product ID', 'SKU', 'Name', 'Serial Number', 'Purchase Date', 'Warranty Months',
    'Customer ID', 'Status', 'Notes', 'Created At', 'Updated At'
  ]), color: '#9334E6'}),
  Object.freeze({name: 'Templates', headers: Object.freeze([
    'Template Key', 'Name', 'Subject', 'Body HTML', 'Locale', 'Active', 'Updated At', 'Updated By'
  ]), color: '#12B5CB'}),
  Object.freeze({name: 'Settings', headers: Object.freeze([
    'Key', 'Value', 'Description', 'Updated At', 'Updated By'
  ]), color: '#5F6368'}),
  Object.freeze({name: 'Logs', headers: Object.freeze([
    'Timestamp', 'Level', 'Message', 'Context JSON', 'Correlation ID', 'User', 'Version'
  ]), color: '#3C4043'})
]);

/** Production defaults seeded only when a setting is absent. @const */
const DEFAULT_SETTINGS = Object.freeze([
  Object.freeze(['SUPPORT_EMAIL', 'support@pocketpiano.com', 'Mailbox or alias used for support']),
  Object.freeze(['SUPPORT_GMAIL_QUERY', 'in:anywhere newer_than:30d', 'Bounded Gmail search query for synchronization']),
  Object.freeze(['GMAIL_SYNC_LIMIT', '100', 'Maximum threads processed per synchronization pass']),
  Object.freeze(['SUPPORT_LABEL', 'PocketPiano/Processed', 'Label applied after successful ingestion']),
  Object.freeze(['ATTACHMENTS_FOLDER', 'Ticket Attachments', 'Drive subfolder for ticket attachments']),
  Object.freeze(['DEFAULT_LOCALE', 'es', 'Default template locale']),
  Object.freeze(['DEFAULT_TIME_ZONE', 'Europe/Madrid', 'Application time zone']),
  Object.freeze(['LOG_LEVEL', 'INFO', 'Minimum operational log level']),
  Object.freeze(['TICKET_NUMBER_PREFIX', 'PP', 'Prefix for human-readable ticket numbers']),
  Object.freeze(['SLA_LOW_HOURS', '72', 'Response target for low-priority tickets']),
  Object.freeze(['SLA_NORMAL_HOURS', '48', 'Response target for normal-priority tickets']),
  Object.freeze(['SLA_HIGH_HOURS', '12', 'Response target for high-priority tickets']),
  Object.freeze(['SLA_CRITICAL_HOURS', '4', 'Response target for critical tickets'])
]);
