import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

export default function FAQView({ t = {} }) {
  const faqs = t.faqItems || [];
  const [openIndex, setOpenIndex] = useState(null);

  const toggle = (index) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="text-center mb-10 md:mb-12">
        <h1 className="section-heading text-3xl md:text-4xl font-black mb-3">
          {t.faq}
        </h1>
        <p className="section-subheading text-sm md:text-base">
          {t.faqSubtitle}
        </p>
      </div>

      <div className="space-y-2.5">
        {faqs.map((faq, index) => {
          const isOpen = openIndex === index;
          return (
            <div
              key={faq.q}
              className={`card overflow-hidden transition-colors duration-200 ${isOpen ? 'border-[color-mix(in_srgb,var(--accent)_35%,var(--border))]' : ''}`}
            >
              <button
                type="button"
                onClick={() => toggle(index)}
                className="w-full flex items-center justify-between gap-4 p-4 sm:p-5 text-start"
              >
                <span className="font-semibold text-sm sm:text-base">{faq.q}</span>
                <span className={`flex-shrink-0 flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--border)] transition-all duration-200 ${isOpen ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)] rotate-180' : 'text-[var(--text-muted)]'}`}>
                  <ChevronDown className="w-4 h-4" />
                </span>
              </button>
              {isOpen && (
                <div className="px-4 sm:px-5 pb-4 sm:pb-5 text-[var(--text-secondary)] text-sm leading-relaxed border-t border-[var(--border)]/50 pt-3">
                  {faq.a}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-10 text-center card p-6">
        <p className="text-[var(--text-secondary)] mb-3">{t.didntFind}</p>
        <div className="flex flex-wrap justify-center gap-3">
          <a href="/contact" className="btn btn-primary text-sm py-2.5 px-5">
            {t.contactSupport}
          </a>
        </div>
      </div>
    </div>
  );
}