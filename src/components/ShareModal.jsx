import React, { useState } from 'react';
import { X, Share2, Copy, Check, ExternalLink } from 'lucide-react';

const ShareModal = ({ 
  isOpen, 
  onClose, 
  shareLink,
  travelerName 
}) => {
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  if (!isOpen || !shareLink) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-wherelse-charcoal border border-wherelse-cream/20 rounded-2xl p-6 w-full max-w-md animate-scale-in">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-wherelse-cream/50 hover:text-wherelse-cream"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-wherelse-yellow/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Share2 className="w-8 h-8 text-wherelse-yellow" />
          </div>
          <h3 className="headline-xl text-2xl text-wherelse-cream mb-2">
            Share Your Trip
          </h3>
          <p className="text-wherelse-cream/60 text-sm">
            Send this link to your friend so they can add their trip and find meetup opportunities
          </p>
        </div>

        {/* Link */}
        <div className="bg-wherelse-charcoal-dark rounded-lg p-3 mb-4">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={shareLink}
              readOnly
              className="flex-1 bg-transparent text-wherelse-cream text-sm font-mono truncate"
            />
            <button
              onClick={copyLink}
              className="p-2 bg-wherelse-yellow text-wherelse-charcoal rounded-lg hover:bg-wherelse-yellow/90 transition-colors"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {copied && (
          <p className="text-center text-wherelse-yellow text-sm mb-4">
            ✓ Link copied to clipboard!
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <a
            href={shareLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 py-3 bg-wherelse-charcoal-dark text-wherelse-cream rounded-lg hover:bg-wherelse-charcoal transition-colors flex items-center justify-center gap-2 text-sm"
          >
            <ExternalLink className="w-4 h-4" />
            Preview
          </a>
          <button
            onClick={copyLink}
            className="flex-1 py-3 bg-wherelse-yellow text-wherelse-charcoal rounded-lg hover:bg-wherelse-yellow/90 transition-colors font-medium text-sm"
          >
            {copied ? 'Copied!' : 'Copy Link'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ShareModal;

