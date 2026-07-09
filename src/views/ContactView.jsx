import React, { useState } from 'react';

export default function ContactView({ t = {}, lang = 'en' }) {
  const isAr = lang === 'ar';

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    message: ''
  });
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.email || !formData.message) {
      alert(isAr ? 'الرجاء إدخال البريد الإلكتروني والرسالة' : 'Please enter your email and message');
      return;
    }

    setIsSubmitting(true);

    // Simulate API call / sending
    await new Promise(resolve => setTimeout(resolve, 800));

    setIsSubmitting(false);
    setSubmitted(true);

    // Reset form after a delay
    setTimeout(() => {
      setFormData({ name: '', email: '', message: '' });
      setSubmitted(false);
    }, 3000);
  };

  return (
    <div className="max-w-xl mx-auto">
      <div className="text-center mb-8">
        <h1 className="text-3xl md:text-4xl font-black mb-2">
          {t.contactUs || (isAr ? 'تواصل معنا' : 'Contact Us')}
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
              {isAr 
                ? 'شكراً لتواصلك. سنقوم بالرد عليك خلال 24 ساعة.' 
                : 'Thank you for reaching out. We will reply within 24 hours.'}
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
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
                placeholder={isAr ? 'your@email.com' : 'your@email.com'}
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
