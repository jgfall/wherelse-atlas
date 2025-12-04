import React from 'react';
import { X } from 'lucide-react';

const DestinationCard = ({ 
  leg, 
  index, 
  onRemove,
  formatDate 
}) => {
  return (
    <div className="card-cream p-4 flex items-center gap-4 group">
      <div className="w-10 h-10 rounded-full bg-wherelse-charcoal/10 flex items-center justify-center font-mono text-sm font-bold text-wherelse-charcoal">
        {String(index + 1).padStart(2, '0')}
      </div>
      <div className="flex-1">
        <h4 className="font-body font-semibold text-wherelse-charcoal">{leg.city}</h4>
        <p className="text-sm text-wherelse-charcoal/60">{leg.country}</p>
        <p className="text-xs font-mono text-wherelse-charcoal/50 mt-1">
          {formatDate(leg.startDate)} — {formatDate(leg.endDate)}
        </p>
      </div>
      <button
        onClick={() => onRemove(leg.id)}
        className="p-2 text-wherelse-charcoal/30 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

export default DestinationCard;

