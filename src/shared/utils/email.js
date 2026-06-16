/**
 * src/shared/utils/email.js — SendGrid Email Utility
 *
 * Handles sending emails via SendGrid (@sendgrid/mail).
 * Automatically mocks/logs emails in 'test' mode to avoid external API calls.
 */

const sgMail = require('@sendgrid/mail');
const config = require('../../config');
const logger = require('../../config/logger');

// Set SendGrid API Key if configured
if (config.sendgrid && config.sendgrid.apiKey) {
  sgMail.setApiKey(config.sendgrid.apiKey);
}

/**
 * Send an email
 * @param {object} options - { to, subject, text, html }
 * @returns {Promise<boolean>}
 */
async function sendEmail({ to, subject, text, html }) {
  // Mock sending email in test environment
  if (config.env === 'test') {
    logger.info(`[Email Mock] Sent email to ${to}: ${subject} | Text: ${text}`);
    return true;
  }

  // Check if SendGrid is properly configured
  if (!config.sendgrid || !config.sendgrid.apiKey || !config.sendgrid.fromEmail) {
    logger.warn('SendGrid is not configured. Falling back to console logging.');
    logger.info(`[Email Output] To: ${to} | Subject: ${subject} | Text: ${text}`);
    return false;
  }

  try {
    const msg = {
      to,
      from: config.sendgrid.fromEmail,
      subject,
      text,
      html,
    };
    await sgMail.send(msg);
    logger.info(`Email sent successfully to ${to}`);
    return true;
  } catch (error) {
    logger.error('Error sending email via SendGrid:', error.message);
    if (error.response && error.response.body) {
      logger.error('SendGrid API Error Details:', JSON.stringify(error.response.body));
    }
    throw error;
  }
}

module.exports = { sendEmail };
