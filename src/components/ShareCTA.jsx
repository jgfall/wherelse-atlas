import React from 'react';
import { Sparkles, Share2, Loader2 } from 'lucide-react';

const ShareCTA = ({ 
  onShare, 
  isSharing, 
  disabled 
}) => {
  return (
    <div className="card-olive p-6 text-center">
      <Sparkles className="w-8 h-8 text-wherelse-charcoal mx-auto mb-3" />
      <h3 className="brand-text text-xl text-wherelse-charcoal mb-2">
        READY TO FIND ADVENTURES?
      </h3>
      <p className="text-wherelse-charcoal/70 font-body mb-4 max-w-sm mx-auto">
        Share your trip with a friend and discover where your paths might cross
      </p>
      <button
        onClick={onShare}
        disabled={isSharing || disabled}
        className="btn-primary px-8 py-3 text-lg disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isSharing ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin mr-2 inline" />
            Creating link...
          </>
        ) : (
          <>
            <Share2 className="w-5 h-5 mr-2 inline" />
            Share with Friend
          </>
        )}
      </button>
    </div>
  );
};

export default ShareCTA;

