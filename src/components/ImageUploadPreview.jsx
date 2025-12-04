import React from 'react';
import { Loader2 } from 'lucide-react';

const ImageUploadPreview = ({ 
  imagePreview, 
  isLoading, 
  error, 
  onRetry 
}) => {
  if (!imagePreview) return null;

  return (
    <div className="mt-8 max-w-md mx-auto">
      <div className="relative rounded-xl overflow-hidden">
        <img
          src={imagePreview}
          alt="Uploaded travel plan"
          className="w-full object-cover"
        />
        {isLoading && (
          <div className="absolute inset-0 bg-wherelse-charcoal/80 flex items-center justify-center">
            <div className="text-center">
              <Loader2 className="w-8 h-8 text-wherelse-yellow animate-spin mx-auto mb-2" />
              <p className="text-wherelse-cream text-sm">Reading your travel plans...</p>
            </div>
          </div>
        )}
      </div>
      {error && (
        <div className="mt-4 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
          <p className="text-red-400 text-sm">{error}</p>
          <button
            onClick={onRetry}
            className="text-red-400/70 text-xs mt-2 underline"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
};

export default ImageUploadPreview;

