/** Managed trigger lifecycle. */
class TriggerManager {
  /**
   * Creates one daily maintenance trigger if absent.
   * Returns null when the script.scriptapp scope is not authorized yet.
   * @return {GoogleAppsScript.Script.Trigger|null}
   */
  static ensureMaintenanceTrigger() {
    return TriggerManager.ensureTimeTrigger_('scheduledMaintenance', function() {
      return ScriptApp.newTrigger('scheduledMaintenance').timeBased().everyDays(1).atHour(3).create();
    });
  }

  /**
   * Creates one five-minute Gmail synchronization trigger if absent.
   * Returns null when the script.scriptapp scope is not authorized yet.
   * @return {GoogleAppsScript.Script.Trigger|null}
   */
  static ensureGmailSyncTrigger() {
    return TriggerManager.ensureTimeTrigger_('syncGmail', function() {
      return ScriptApp.newTrigger('syncGmail').timeBased().everyMinutes(5).create();
    });
  }

  /** Removes only triggers managed by this application. */
  static removeManagedTriggers() {
    try {
      const managedHandlers = ['scheduledMaintenance', 'syncGmail'];
      ScriptApp.getProjectTriggers().forEach(function(trigger) {
        if (managedHandlers.indexOf(trigger.getHandlerFunction()) !== -1) {
          ScriptApp.deleteTrigger(trigger);
        }
      });
    } catch (error) {
      if (TriggerManager.isMissingScopeError_(error)) {
        AppLogger.warn('Managed triggers could not be removed because script.scriptapp permission is missing.', {
          error: error.message || String(error)
        });
        return;
      }
      throw error;
    }
  }

  /**
   * @param {string} handler
   * @param {function(): GoogleAppsScript.Script.Trigger} factory
   * @return {GoogleAppsScript.Script.Trigger|null}
   * @private
   */
  static ensureTimeTrigger_(handler, factory) {
    try {
      const existing = ScriptApp.getProjectTriggers().filter(function(trigger) {
        return trigger.getHandlerFunction() === handler;
      });
      return existing.length ? existing[0] : factory();
    } catch (error) {
      if (TriggerManager.isMissingScopeError_(error)) {
        AppLogger.warn('Trigger was not installed because script.scriptapp permission is missing.', {
          handler: handler,
          error: error.message || String(error)
        });
        return null;
      }
      throw error;
    }
  }

  /** @param {*} error @return {boolean} @private */
  static isMissingScopeError_(error) {
    const message = error && error.message ? error.message : String(error || '');
    return message.indexOf('script.scriptapp') !== -1 ||
      message.indexOf('ScriptApp.getProjectTriggers') !== -1 ||
      message.indexOf('Specified permissions are not sufficient') !== -1;
  }
}

/** Performs bounded daily operational housekeeping. */
function scheduledMaintenance() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) {
    AppLogger.warn('Scheduled maintenance skipped because another job holds the lock.');
    return;
  }
  try {
    purgeExpiredLogs_();
    AppLogger.info('Scheduled maintenance completed.');
  } catch (error) {
    AppLogger.error('Scheduled maintenance failed.', {error: String(error), stack: error.stack || ''});
    throw error;
  } finally {
    lock.releaseLock();
  }
}

/** Deletes contiguous oldest log rows beyond retention. @private */
function purgeExpiredLogs_() {
  const sheet = AppConfig.getSheet(APP.SHEETS.LOGS);
  if (sheet.getLastRow() <= 1) {
    return;
  }
  const cutoff = new Date(Date.now() - APP.LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const timestamps = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  let rowsToDelete = 0;
  for (let index = 0; index < timestamps.length; index += 1) {
    const value = timestamps[index][0];
    if (value instanceof Date && value < cutoff) {
      rowsToDelete += 1;
    } else {
      break;
    }
  }
  if (rowsToDelete > 0) {
    sheet.deleteRows(2, rowsToDelete);
  }
}
