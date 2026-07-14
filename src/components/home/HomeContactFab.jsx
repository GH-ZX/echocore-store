import { useState } from 'react';
import { createPortal } from 'react-dom';
import { MessageCircle, X } from 'lucide-react';
import Modal from '../ui/Modal';
import SocialLinkIcon from '../social/SocialLinkIcon';
import { getStoreContactLinks } from '../../lib/socialLinks';
import { followUsOnLabel } from '../../lib/i18n';

export default function HomeContactFab({ t = {}, lang = 'ar', stacked = false }) {
  const [open, setOpen] = useState(false);
  const links = getStoreContactLinks();

  if (typeof document === 'undefined') return null;

  return createPortal(
    <>
      <button
        type="button"
        className={`home-contact-fab${stacked ? ' home-contact-fab--stacked' : ''}`}
        onClick={() => setOpen(true)}
        aria-label={t.homeContactFabAria}
        title={t.contactUs}
      >
        <MessageCircle className="w-5 h-5" strokeWidth={2} />
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="sm"
        ariaLabelledBy="home-contact-modal-title"
      >
        <div className="modal-panel__header">
          <h2 id="home-contact-modal-title" className="text-lg font-bold">
            {t.contactUs}
          </h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="p-2 rounded-lg hover:bg-white/5"
            aria-label={t.homeSectionClose}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="modal-panel__body">
          <p className="text-sm text-[var(--text-sec)] mb-4 leading-relaxed">
            {t.homeContactModalDesc}
          </p>
          <div className="space-y-3">
            {links.map((link) => (
              <a
                key={link.id}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={followUsOnLabel(lang, link.platform)}
                className="social-link-tree__item group"
                style={{ '--social-accent': link.accent }}
              >
                <span className="social-link-tree__icon">
                  <SocialLinkIcon id={link.id} className="w-5 h-5" />
                </span>
                <span className="social-link-tree__text min-w-0 flex-1">
                  <span className="social-link-tree__platform block font-semibold truncate">
                    {link.platform}
                  </span>
                  <span className="social-link-tree__handle block text-xs opacity-80 truncate" dir="ltr">
                    {link.handle}
                  </span>
                </span>
                <span className="social-link-tree__arrow text-xs opacity-60 group-hover:opacity-100 transition-opacity">
                  {lang === 'ar' ? t.navArrowBack : t.navArrowForward}
                </span>
              </a>
            ))}
          </div>
        </div>
      </Modal>
    </>,
    document.body,
  );
}