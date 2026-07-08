/** Google Cloud Translation integration for support conversations. */
class TranslationService {
  /**
   * Translates a batch of UI messages to Spanish. Existing sheet translations are reused.
   * @param {Array<Object>} messages
   * @return {Array<Object>}
   */
  static translateMessagesToSpanish(messages) {
    const items = messages || [];
    if (!items.length) return [];
    return items.map(function(message) {
      const text = String(message.body || '');
      const storedTranslation = String(message.translatedBodyEs || '');
      const storedLanguage = String(message.originalLanguage || '');
      if (storedTranslation) {
        return Object.assign({}, message, {
          translatedBody: storedTranslation,
          detectedLanguage: storedLanguage,
          translated: storedLanguage.toLowerCase() !== 'es',
          cached: true
        });
      }
      if (!text.trim()) {
        return Object.assign({}, message, {translatedBody: '', detectedLanguage: storedLanguage, translated: false, cached: false});
      }
      const translated = TranslationService.translateText_(text);
      return Object.assign({}, message, {
        translatedBody: translated.text,
        translatedBodyEs: translated.text,
        detectedLanguage: translated.detectedLanguage,
        originalLanguage: translated.detectedLanguage,
        translated: translated.detectedLanguage && translated.detectedLanguage.toLowerCase() !== 'es',
        cached: false
      });
    });
  }

  /**
   * Stores service account credentials in Script Properties.
   * Paste the full JSON downloaded from Google Cloud.
   * @param {string} jsonText
   * @return {{ok: boolean, clientEmail: string, projectId: string}}
   */
  static saveServiceAccount(jsonText) {
    const credentials = TranslationService.parseServiceAccount_(jsonText);
    AppConfig.getProperties().setProperty('GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON', JSON.stringify(credentials));
    return {ok: true, clientEmail: credentials.client_email, projectId: credentials.project_id};
  }

  /** @param {string} text @return {{text: string, detectedLanguage: string}} @private */
  static translateText_(text) {
    const serviceAccount = TranslationService.getServiceAccount_();
    if (serviceAccount) return TranslationService.translateTextWithServiceAccount_(text, serviceAccount);
    const apiKey = String(AppConfig.getSetting('GOOGLE_TRANSLATE_API_KEY', '') || '').trim();
    if (apiKey) return TranslationService.translateTextWithApiKey_(text, apiKey);
    throw new AppError(
      'Google Cloud Translation credentials are missing. Run setupGoogleCloudServiceAccount() or add GOOGLE_TRANSLATE_API_KEY in Settings.',
      'TRANSLATE_CREDENTIALS_MISSING'
    );
  }

  /**
   * @param {string} text
   * @param {Object} serviceAccount
   * @return {{text: string, detectedLanguage: string}}
   * @private
   */
  static translateTextWithServiceAccount_(text, serviceAccount) {
    const token = TranslationService.getAccessToken_(serviceAccount);
    const response = UrlFetchApp.fetch('https://translation.googleapis.com/language/translate/v2', {
      method: 'post',
      contentType: 'application/json; charset=utf-8',
      headers: {Authorization: 'Bearer ' + token},
      muteHttpExceptions: true,
      payload: JSON.stringify({q: text, target: 'es', format: 'text'})
    });
    return TranslationService.parseTranslationResponse_(response);
  }

  /**
   * @param {string} text
   * @param {string} apiKey
   * @return {{text: string, detectedLanguage: string}}
   * @private
   */
  static translateTextWithApiKey_(text, apiKey) {
    const url = 'https://translation.googleapis.com/language/translate/v2?key=' + encodeURIComponent(apiKey);
    const response = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json; charset=utf-8',
      muteHttpExceptions: true,
      payload: JSON.stringify({q: text, target: 'es', format: 'text'})
    });
    return TranslationService.parseTranslationResponse_(response);
  }

  /**
   * @param {GoogleAppsScript.URL_Fetch.HTTPResponse} response
   * @return {{text: string, detectedLanguage: string}}
   * @private
   */
  static parseTranslationResponse_(response) {
    const status = response.getResponseCode();
    const body = response.getContentText();
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch (error) {
      throw new AppError('Invalid translation response from Google Cloud.', 'TRANSLATE_INVALID_RESPONSE', {status: status});
    }
    if (status < 200 || status >= 300) {
      throw new AppError((parsed.error && parsed.error.message) || 'Google Cloud Translation request failed.', 'TRANSLATE_REQUEST_FAILED', {status: status});
    }
    const result = parsed.data && parsed.data.translations && parsed.data.translations[0];
    return {
      text: result ? String(result.translatedText || '') : '',
      detectedLanguage: result ? String(result.detectedSourceLanguage || '') : ''
    };
  }

  /** @return {Object|null} @private */
  static getServiceAccount_() {
    const raw = AppConfig.getProperties().getProperty('GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON');
    if (!raw) return null;
    return TranslationService.parseServiceAccount_(raw);
  }

  /** @param {string} jsonText @return {Object} @private */
  static parseServiceAccount_(jsonText) {
    let credentials;
    try {
      credentials = JSON.parse(jsonText);
    } catch (error) {
      throw new AppError('Invalid Google Cloud service account JSON.', 'SERVICE_ACCOUNT_JSON_INVALID');
    }
    ['client_email', 'private_key', 'token_uri', 'project_id'].forEach(function(key) {
      if (!credentials[key]) throw new AppError('Service account JSON is missing: ' + key, 'SERVICE_ACCOUNT_JSON_INCOMPLETE', {key: key});
    });
    return credentials;
  }

  /** @param {Object} serviceAccount @return {string} @private */
  static getAccessToken_(serviceAccount) {
    const now = Math.floor(Date.now() / 1000);
    const header = {alg: 'RS256', typ: 'JWT'};
    const claim = {
      iss: serviceAccount.client_email,
      scope: 'https://www.googleapis.com/auth/cloud-translation',
      aud: serviceAccount.token_uri,
      exp: now + 3600,
      iat: now
    };
    const unsignedJwt = TranslationService.base64Url_(JSON.stringify(header)) + '.' + TranslationService.base64Url_(JSON.stringify(claim));
    const signature = Utilities.computeRsaSha256Signature(unsignedJwt, serviceAccount.private_key);
    const jwt = unsignedJwt + '.' + TranslationService.base64UrlBytes_(signature);

    const response = UrlFetchApp.fetch(serviceAccount.token_uri, {
      method: 'post',
      payload: {grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt},
      muteHttpExceptions: true
    });
    const status = response.getResponseCode();
    const body = response.getContentText();
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch (error) {
      throw new AppError('Invalid Google OAuth token response.', 'GOOGLE_TOKEN_INVALID_RESPONSE', {status: status});
    }
    if (status < 200 || status >= 300 || !parsed.access_token) {
      throw new AppError((parsed.error_description || parsed.error || 'Could not obtain Google Cloud access token.'), 'GOOGLE_TOKEN_REQUEST_FAILED', {status: status});
    }
    return parsed.access_token;
  }

  /** @param {string} text @return {string} @private */
  static base64Url_(text) {
    return Utilities.base64EncodeWebSafe(text).replace(/=+$/, '');
  }

  /** @param {Byte[]} bytes @return {string} @private */
  static base64UrlBytes_(bytes) {
    return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '');
  }
}

/**
 * Run once from Apps Script and paste the downloaded service-account JSON.
 * @param {string} serviceAccountJson
 * @return {{ok: boolean, clientEmail: string, projectId: string}}
 */
function setupGoogleCloudServiceAccount(serviceAccountJson) {
  return TranslationService.saveServiceAccount(serviceAccountJson);
}
