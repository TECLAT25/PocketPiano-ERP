/**
 * CRM customer persistence for support workflows.
 */
class SheetCustomerRepository {
  constructor() {
    this.sheet_ = AppConfig.getSheet(APP.SHEETS.CUSTOMERS);
    this.headers_ = this.sheet_.getRange(1, 1, 1, this.sheet_.getLastColumn()).getDisplayValues()[0];
    this.headerIndex_ = {};
    this.headers_.forEach(function(header, index) {
      if (header) this.headerIndex_[header] = index;
    }, this);
    ['Customer ID', 'Email', 'Name', 'Created At', 'Updated At'].forEach(function(header) {
      if (this.headerIndex_[header] == null) {
        throw new AppError(
          'Customers sheet is missing the "' + header + '" column. Run install().',
          'CUSTOMER_SCHEMA_OUTDATED',
          {header: header}
        );
      }
    }, this);
    this.reload_();
  }

  /** @private */
  reload_() {
    this.byId_ = {};
    this.byEmail_ = {};
    this.listAll().forEach(function(customer) {
      this.byId_[customer.id] = customer;
      if (customer.email) this.byEmail_[customer.email.toLowerCase()] = customer;
    }, this);
  }

  /** @return {Array<Object>} */
  listAll() {
    if (this.sheet_.getLastRow() <= 1) return [];
    return this.sheet_.getRange(2, 1, this.sheet_.getLastRow() - 1, this.headers_.length)
      .getValues()
      .map(function(row, index) { return this.fromRow_(row, index + 2); }, this);
  }

  /** @param {string} id @return {Object|null} */
  findById(id) {
    return this.byId_[String(id || '')] || null;
  }

  /** @param {string} email @return {Object|null} */
  findByEmail(email) {
    return this.byEmail_[String(email || '').trim().toLowerCase()] || null;
  }

  /**
   * Creates or updates a customer by email.
   * @param {{email: string, name: string, locale: string, company: string, notes: string}=} input
   * @return {Object}
   */
  upsertByEmail(input) {
    const data = input || {};
    const email = String(data.email || '').trim().toLowerCase();
    if (!email) {
      throw new AppError('Customer email is required.', 'CUSTOMER_EMAIL_REQUIRED');
    }
    const existing = this.findByEmail(email);
    if (existing) {
      const changes = {
        name: data.name || existing.name,
        locale: data.locale || existing.locale,
        company: data.company || existing.company,
        notes: data.notes || existing.notes,
        updatedAt: new Date()
      };
      return this.update(existing.id, changes);
    }

    const now = new Date();
    const record = {
      id: SheetCustomerRepository.nextCustomerId_(),
      email: email,
      name: String(data.name || '').trim(),
      phone: '',
      locale: String(data.locale || AppConfig.getSetting('DEFAULT_LOCALE', 'es')).trim(),
      company: String(data.company || '').trim(),
      createdAt: now,
      updatedAt: now,
      notes: String(data.notes || '').trim()
    };
    const row = this.emptyRow_();
    SheetCustomerRepository.fields_().forEach(function(mapping) {
      if (this.headerIndex_[mapping.header] != null) {
        row[this.headerIndex_[mapping.header]] = record[mapping.field] || '';
      }
    }, this);
    this.sheet_.appendRow(row);
    const created = this.fromRow_(row, this.sheet_.getLastRow());
    this.byId_[created.id] = created;
    this.byEmail_[created.email.toLowerCase()] = created;
    return created;
  }

  /** @param {string} customerId @param {Object} changes @return {Object} */
  update(customerId, changes) {
    const customer = this.findById(customerId);
    if (!customer) {
      throw new AppError('Customer not found: ' + customerId, 'CUSTOMER_NOT_FOUND', {customerId: customerId});
    }
    const row = this.sheet_.getRange(customer.rowNumber, 1, 1, this.headers_.length).getValues()[0];
    const allowed = ['email', 'name', 'phone', 'locale', 'company', 'updatedAt', 'notes'];
    SheetCustomerRepository.fields_().forEach(function(mapping) {
      if (allowed.indexOf(mapping.field) !== -1 &&
          Object.prototype.hasOwnProperty.call(changes, mapping.field)) {
        row[this.headerIndex_[mapping.header]] = changes[mapping.field];
      }
    }, this);
    this.sheet_.getRange(customer.rowNumber, 1, 1, row.length).setValues([row]);
    const updated = this.fromRow_(row, customer.rowNumber);
    this.byId_[updated.id] = updated;
    if (updated.email) this.byEmail_[updated.email.toLowerCase()] = updated;
    return updated;
  }

  /** @return {Array<*>} @private */
  emptyRow_() {
    return this.headers_.map(function() { return ''; });
  }

  /** @param {Array<*>} row @param {number} rowNumber @return {Object} @private */
  fromRow_(row, rowNumber) {
    const customer = {rowNumber: rowNumber};
    SheetCustomerRepository.fields_().forEach(function(mapping) {
      const index = this.headerIndex_[mapping.header];
      customer[mapping.field] = index == null ? '' : row[index];
    }, this);
    ['id', 'email', 'name', 'phone', 'locale', 'company', 'notes'].forEach(function(field) {
      customer[field] = String(customer[field] || '');
    });
    return customer;
  }

  /** @return {string} @private */
  static nextCustomerId_() {
    const properties = AppConfig.getProperties();
    const key = 'CUSTOMER_SEQUENCE';
    let sequence = Number(properties.getProperty(key));
    if (!Number.isInteger(sequence) || sequence < 0) sequence = 0;
    sequence += 1;
    properties.setProperty(key, String(sequence));
    return 'CUST-' + String(sequence).padStart(6, '0');
  }

  /** @return {Array<{field: string, header: string}>} @private */
  static fields_() {
    return [
      {field: 'id', header: 'Customer ID'},
      {field: 'email', header: 'Email'},
      {field: 'name', header: 'Name'},
      {field: 'phone', header: 'Phone'},
      {field: 'locale', header: 'Locale'},
      {field: 'company', header: 'Company'},
      {field: 'createdAt', header: 'Created At'},
      {field: 'updatedAt', header: 'Updated At'},
      {field: 'notes', header: 'Notes'}
    ];
  }
}
