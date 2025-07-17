/**
 * @file config.ts
 * @description Centralized configuration file for the entire application.
 * This file acts as the single source of truth for API keys, application constants,
 * versioning, and other settings. It reads values from environment variables
 * provided by Vite.
 */

// --- Versioning ---
// Injected by Vite during the build process from package.json
const rawVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '2.0.0';
// Formatted version for display in the UI (e.g., "V2.0")
const formattedVersion = `V${rawVersion.split('.').slice(0, 2).join('.')}`;

// --- Email Content ---
/**
 * Generates the HTML content for the email body.
 * @param serviceUnit - The name of the service unit.
 * @param dateTime - The date and time of the service.
 * @returns An HTML string for the email body.
 */
const getEmailHtmlContent = (serviceUnit: string, dateTime: string): string => {
  const datePart = dateTime.split('T')[0];
  return `
    <p>您好，</p>
    <p>附件為 ${datePart} ${serviceUnit} 的工作服務單，請查收。</p>
    <p>此為系統自動發送信件，請勿直接回覆。</p>
    <p>謝謝您！</p>
    <p>富元機電有限公司 TEL:(02)2697-5163 FAX:(02)2697-5339</p>
    <p>新北市汐止區新台五路一段99號14樓之12</p>
    <p>E-mail：fuhyuan.w5339@msa.hinet.net</p>
  `;
};

// --- Main Configuration Object ---
export const config = {
  version: {
    raw: rawVersion,
    formatted: formattedVersion,
  },
  api: {
    /**
     * Google Drive and Picker API settings.
     * These are read from VITE_* environment variables.
     * See README.md for setup instructions.
     */
    google: {
      apiKey: import.meta.env.VITE_GOOGLE_API_KEY,
      clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID,
      discoveryDoc: 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest',
      scopes: 'https://www.googleapis.com/auth/drive.file',
    },
    /**
     * Brevo (formerly Sendinblue) API settings for sending emails.
     * These are read from VITE_* environment variables.
     */
    brevo: {
      apiKey: import.meta.env.VITE_BREVO_API_KEY,
      senderEmail: import.meta.env.VITE_BREVO_SENDER_EMAIL,
      senderName: import.meta.env.VITE_BREVO_SENDER_NAME,
      apiUrl: 'https://api.brevo.com/v3/smtp/email',
    },
    /**
     * Gemini API settings.
     * Placeholder for future AI features.
     */
    gemini: {
      apiKey: import.meta.env.VITE_GEMINI_API_KEY,
    },
  },
  app: {
    /**
     * Constants controlling form behavior and limits.
     */
    pdfLimits: {
      // Total visual lines across all major text areas before splitting into a second page.
      totalContent: 20,
      // Combined line limit for the "Tasks" and "Status" fields.
      tasksStatus: 18,
      // Combined line limit for "Products" (each item counts as 1 line for quantity) and "Remarks".
      productsRemarks: 16,
    },
    /**
     * Keys used for storing data in localStorage.
     */
    storageKeys: {
      drafts: 'workOrderNamedDrafts_v2', // Versioned to avoid conflicts with old data
      googleAuth: 'googleAuthGranted_v2',
    },
    /**
     * Maximum number of named drafts that can be saved locally.
     */
    maxDrafts: 5,
    /**
     * Email template generator function.
     */
    emailTemplate: getEmailHtmlContent,
    /**
     * Default recipient for the email modal.
     */
    defaultEmailRecipient: 'fuhyuan.w5339@msa.hinet.net',
  },
};
