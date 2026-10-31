import { siteConfig } from "@/config/site";

/**
 * Editable copy for the contact page (/contact) and its form.
 * Field limits are enforced in src/lib/validation.ts - keep the two in step.
 */
export const contactContent = {
  title: "Contact Faithful Word Music",
  lead: "Questions about the song list, the hymn resources, or the music ministry? Send a note below and we will reply by email.",

  /** Shown alongside the form so there is always a way through. */
  directLabel: "Prefer email?",
  directEmail: siteConfig.contactEmail,

  form: {
    name: { label: "Name", placeholder: "Your name" },
    email: { label: "Email", placeholder: "you@example.com" },
    subject: { label: "Subject", placeholder: "What is this about?" },
    message: { label: "Message", placeholder: "How can we help?" },

    submit: "Send Message",
    submitting: "Sending…",

    required: "Required",
    optionalNote: "We only use your email address to reply to you.",

    /** Keyboard shortcut hint, shown on wider screens. {key} is Ctrl or ⌘. */
    shortcutHint: "{key} + Enter to send",

    /** Shown when an unsent message is brought back from this browser. */
    draftRestored: "We saved your unsent message.",

    /** Empties the form (and the saved draft). */
    clear: "Clear",

    /** Character counter under the message, e.g. "3,210 / 4,000". */
    characterCount: "{count} / {limit} characters",
  },

  /**
   * The short acknowledgement emailed to the visitor after they send a message
   * (src/lib/contact-email.ts). It never repeats their message: if it did, the
   * form could be used to send any text to any address. Their name and subject
   * appear only when they hold no link or address (safeEcho); otherwise the
   * plain fallbacks below are used. Promise no response time.
   */
  confirmation: {
    subject: "We received your message",
    heading: "We received your message",
    greeting: "Hello {name},",
    greetingFallback: "Hello,",
    body: "Thank you for contacting Faithful Word Music. Your message has reached us, and we will reply to this email address as soon as possible.",
    subjectLine: "Subject: {subject}",
    replyNote: "If you would like to add anything, simply reply to this email.",
    signOff: "Faithful Word Music",
    footer:
      "You are receiving this because this address was used to send a message through our website. If that was not you, you can safely ignore this email.",
  },

  status: {
    successTitle: "Message sent",
    successBody:
      "Thank you - your message is on its way. We have emailed you a confirmation, and we will reply to the address you gave us as soon as possible.",
    sendAnother: "Send another message",

    errorTitle: "Your message could not be sent",
    /** Fallback when the server gives no specific reason. */
    errorBody: `Something went wrong on our end. Please try again in a moment, or email us directly at ${siteConfig.contactEmail}.`,

    /**
     * Shown when Vercel BotID judges a submission automated. It always names
     * the direct address, so a visitor wrongly flagged - an unusual browser, a
     * blocked script - still has a way to reach the ministry.
     */
    botBody: `We could not verify this submission. Please email us directly at ${siteConfig.contactEmail} and we will get back to you.`,
  },

  /** Client-side validation messages. The server enforces the same rules. */
  errors: {
    nameRequired: "Please enter your name.",
    nameTooLong: "Please keep your name under 80 characters.",
    emailRequired: "Please enter your email address.",
    emailInvalid: "Please enter a valid email address.",
    emailTooLong: "Please enter a shorter email address.",
    subjectRequired: "Please enter a subject.",
    subjectTooLong: "Please keep the subject under 120 characters.",
    messageRequired: "Please enter a message.",
    messageTooLong: "Please keep your message under 4000 characters.",
  },
} as const;
