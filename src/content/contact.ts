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
  },

  status: {
    successTitle: "Message sent",
    successBody:
      "Thank you - your message is on its way. We will reply to the email address you gave us.",
    sendAnother: "Send another message",

    errorTitle: "Your message could not be sent",
    /** Fallback when the server gives no specific reason. */
    errorBody: `Something went wrong on our end. Please try again in a moment, or email us directly at ${siteConfig.contactEmail}.`,
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
