import React from 'react';

export default function HowItWorksView({ t = {} }) {
  const steps = t.howItWorksSteps || [];

  return (
    <div className="max-w-4xl mx-auto">
      <div className="text-center mb-10">
        <h1 className="text-3xl md:text-4xl font-black mb-3">
          {t.howItWorks}
        </h1>
        <p className="text-[var(--text-secondary)] max-w-md mx-auto">
          {t.howSubtitle}
        </p>
      </div>

      <div className="space-y-6">
        {steps.map((step) => (
          <div key={step.number} className="card p-6 flex gap-6 items-start">
            <div className="flex-shrink-0 w-14 h-14 rounded-2xl bg-[var(--accent)]/10 text-[var(--accent)] flex items-center justify-center text-2xl font-black">
              {step.number}
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-xl mb-2">{step.title}</h3>
              <p className="text-[var(--text-secondary)] leading-relaxed">{step.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-10 card p-6 bg-[var(--bg-surface)] text-center">
        <div className="text-2xl mb-2">⚡</div>
        <h3 className="font-semibold text-lg mb-2">
          {t.instantDelivery100}
        </h3>
        <p className="text-[var(--text-secondary)] text-sm max-w-md mx-auto">
          {t.guaranteeNote}
        </p>
      </div>
    </div>
  );
}