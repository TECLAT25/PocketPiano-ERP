/** Google Cloud Translation integration for support conversations. */
class TranslationService {
  /**
   * Translates a batch of UI messages to Spanish.
   * @param {Array<Object>} messages
   * @return {Array<Object>}
   */
  static translateMessagesToSpanish(messages) {
    const items = messages || [];
    if (!items.length) return [];
    const apiKey = String(AppConfig.getSetting('GOOGLE_TRANSLATE_API_KEY', '') || '').trim();
    if (!apiKey) {
      throw new AppError(
        'Google Cloud Translation API key is missing. Add GOOGLE_TRANSLATE_API_KEY in Settings.',
        'TRANSLATE_API_KEY_MISSING'
      );
    }

    return items.map(function(message) {
      const text = String(message.body || '');
      if (!text.trim()) {
        return Object.assign({}, message, {translatedBody: '', detectedLanguage: '', translated: false});
      }
      const translated = TranslationService.translateText_(text, apiKey);
      return Object.assign({}, message, {
        translatedBody: translated.text,
        detectedLanguage: translated.detectedLanguage,
        translated: translated.detectedLanguage && translated.detectedLanguage.toLowerCase() !== 'es'
      });
    });
  }

  /**
   * @param {string} text
   * @param {string} apiKey
   * @return {{text: string, detectedLanguage: string}}
   * @private
   */
  static translateText_(text, apiKey) {
    const url = 'https://translation.googleapis.com/language/translate/v2?key=' + encodeURIComponent(apiKey);
    const response = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json; charset=utf-8',
      muteHttpExceptions: true,
      payload: JSON.stringify({q: text, target: 'es', format: 'text'})
    });
    const status = response.getResponseCode();
    const body = response.getContentText();
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch (error) {
      throw new AppError('Invalid translation response from Google Cloud.', 'TRANSLATE_INVALID_RESPONSE', {status: status});
    }
    if (status < 200 || status >= 300) {
      throw new AppError(
        (parsed.error && parsed.error.message) || 'Google Cloud Translation request failed.',
        'TRANSLATE_REQUEST_FAILED',
        {status: status}
      );
    }
    const result = parsed.data && parsed.data.translations && parsed.data.translations[0];
    return {
      text: result ? String(result.translatedText || '') : '',
      detectedLanguage: result ? String(result.detectedSourceLanguage || '') : ''
    };
  }
}
