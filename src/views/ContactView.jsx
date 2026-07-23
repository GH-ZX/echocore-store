import { useState } from 'react';
import { contactErrorMessage, submitContactMessage } from '../lib/contact';

export default function ContactView({ t = {}, user = null }) {
  const [formData, setFormData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    message: '',
    /** Honeypot — leave empty; bots often fill hidden fields */
    company: '',
  });
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (error) setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.email?.trim() || !formData.message?.trim()) {
      setError(t.contactEmailMessageRequired);
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      await submitContactMessage({
        name: formData.name,
        email: formData.email,
        message: formData.message,
        userId: user?.id,
        honeypot: formData.company,
      });

      setSubmitted(true);
      setTimeout(() => {
        setFormData({
          name: user?.name || '',
          email: user?.email || '',
          message: '',
          company: '',
        });
        setSubmitted(false);
      }, 4000);
    } catch (err) {
      setError(contactErrorMessage(err, t));
      console.error('Contact form error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto">
      <div className="text-center mb-8">
        <h1 className="text-3xl md:text-4xl font-black mb-2">
          {t.contactUs}
        </h1>
        <p className="text-[var(--text-secondary)]">
          {t.contactSubtitle}
        </p>
      </div>

      <div className="card p-6 md:p-8">
        {submitted ? (
          <div className="text-center py-8">
            <div className="text-5xl mb-4">✅</div>
            <h3 className="text-xl font-bold mb-2 text-[var(--accent)]">
              {t.messageSent}
            </h3>
            <p className="text-[var(--text-secondary)]">
              {t.contactThankYouBody}
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5" autoComplete="on">
            {/* Honeypot: visually hidden, not tabbable */}
            <div
              aria-hidden="true"
              style={{
                position: 'absolute',
                left: '-10000px',
                top: 'auto',
                width: '1px',
                height: '1px',
                overflow: 'hidden',
              }}
            >
              <label htmlFor="contact-company">{t.contactHoneypotLabel || 'Company'}</label>
              <input
                id="contact-company"
                type="text"
                name="company"
                value={formData.company}
                onChange={handleChange}
                tabIndex={-1}
                autoComplete="off"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--text-sec)] mb-1.5">
                {t.nameOptional}
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                className="input w-full"
                placeholder={t.yourName}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--text-sec)] mb-1.5">
                {t.email} <span className="text-red-400">*</span>
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                required
                className="input w-full"
                placeholder="your@email.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--text-sec)] mb-1.5">
                {t.messageLabel} <span className="text-red-400">*</span>
              </label>
              <textarea
                name="message"
                value={formData.message}
                onChange={handleChange}
                required
                rows={6}
                className="input w-full resize-y min-h-[120px]"
                placeholder={t.messagePlaceholder}
              />
            </div>

            {error && (
              <p className="text-sm text-red-400 text-center">{error}</p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="btn btn-primary w-full py-3.5 text-base font-bold disabled:opacity-70"
            >
              {isSubmitting ? t.sending : t.sendMessage}
            </button>

            <p className="text-center text-xs text-[var(--text-muted)]">
              {t.replyWithin}
            </p>
          </form>
        )}
      </div>

      <div className="mt-6 text-center text-sm text-[var(--text-secondary)]">
        {t.reachDirectly}{' '}
        <a href="mailto:support@echocore.store" className="text-[var(--accent)] hover:underline">
          support@echocore.store
        </a>
      </div>
    </div>
  );
}
