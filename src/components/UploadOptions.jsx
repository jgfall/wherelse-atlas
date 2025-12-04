import React from 'react';
import { Image, Plus } from 'lucide-react';

const UploadOptions = ({ 
  onImageClick, 
  onManualClick, 
  onFileClick 
}) => {
  return (
    <>
      {/* Upload Options Grid */}
      <div className="grid md:grid-cols-2 gap-6 max-w-2xl mx-auto">
        {/* Image Upload */}
        <div
          onClick={onImageClick}
          className="card-olive p-8 cursor-pointer hover:scale-[1.02] transition-transform text-center group"
        >
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-wherelse-charcoal/20 flex items-center justify-center group-hover:bg-wherelse-charcoal/30 transition-colors">
            <Image className="w-8 h-8 text-wherelse-charcoal" />
          </div>
          <h3 className="brand-text text-lg text-wherelse-charcoal mb-2">
            UPLOAD SCREENSHOT
          </h3>
          <p className="text-wherelse-charcoal/60 text-sm font-body">
            Upload a photo of your travel plans and we'll extract the details
          </p>
        </div>

        {/* Manual Build */}
        <div
          onClick={onManualClick}
          className="card-yellow p-8 cursor-pointer hover:scale-[1.02] transition-transform text-center group"
        >
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-wherelse-charcoal/10 flex items-center justify-center group-hover:bg-wherelse-charcoal/20 transition-colors">
            <Plus className="w-8 h-8 text-wherelse-charcoal" />
          </div>
          <h3 className="brand-text text-lg text-wherelse-charcoal mb-2">
            BUILD MANUALLY
          </h3>
          <p className="text-wherelse-charcoal/60 text-sm font-body">
            Add your destinations one by one with dates
          </p>
        </div>
      </div>

      {/* File Upload Option */}
      <div className="mt-6 text-center">
        <button
          onClick={onFileClick}
          className="text-wherelse-cream/50 hover:text-wherelse-cream text-sm font-body underline underline-offset-4"
        >
          Or upload a JSON/CSV file
        </button>
      </div>
    </>
  );
};

export default UploadOptions;

