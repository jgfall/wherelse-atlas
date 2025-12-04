import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, MapPin, Calendar, X, Edit2 } from 'lucide-react';

function SortableLegItem({ leg, index, onEdit, onDelete, formatDate }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: leg.id });
  
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-4 p-4 rounded-lg border transition-all ${
        leg.isValid === false
          ? 'bg-wherelse-red/10 border-wherelse-red/30'
          : leg.isValidating || leg.isValid === undefined
            ? 'bg-wherelse-charcoal/50 border-wherelse-yellow/20'
            : 'bg-wherelse-charcoal/30 border-wherelse-cream/10 hover:border-wherelse-yellow/30 hover:bg-wherelse-charcoal/50'
      } ${isDragging ? 'shadow-lg' : ''}`}
    >
      {/* Drag Handle */}
      <button
        {...attributes}
        {...listeners}
        className="text-wherelse-cream/30 hover:text-wherelse-yellow transition-colors cursor-grab active:cursor-grabbing"
      >
        <GripVertical className="w-5 h-5" />
      </button>
      
      {/* Index */}
      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-mono text-sm font-bold ${
        leg.isValid === false
          ? 'bg-wherelse-red/20 text-wherelse-red'
          : leg.isValidating || leg.isValid === undefined
            ? 'bg-wherelse-yellow/20 text-wherelse-yellow/70'
            : 'bg-wherelse-yellow/20 text-wherelse-yellow'
      }`}>
        {String(index + 1).padStart(2, '0')}
        {leg.isValid === false && ' ⚠️'}
        {(leg.isValidating || leg.isValid === undefined) && ' ⏳'}
      </div>
      
      {/* Location Info */}
      <div 
        className={`flex-1 min-w-0 ${leg.isValid === false ? 'cursor-pointer' : ''}`}
        onClick={leg.isValid === false ? () => onEdit(leg.id) : undefined}
      >
        <div className="flex items-center gap-2 mb-1">
          <MapPin className={`w-4 h-4 flex-shrink-0 ${
            leg.isValid === false
              ? 'text-wherelse-red'
              : leg.isValidating || leg.isValid === undefined
                ? 'text-wherelse-yellow/50'
                : 'text-wherelse-yellow'
          }`} />
          <h4 className={`headline-xl text-lg truncate ${
            leg.isValid === false
              ? 'text-wherelse-red'
              : leg.isValidating || leg.isValid === undefined
                ? 'text-wherelse-cream/70'
                : 'text-wherelse-cream'
          }`}>
            {leg.city.toUpperCase()}
          </h4>
        </div>
        <p className={`text-sm font-body ${
          leg.isValid === false
            ? 'text-wherelse-red/70'
            : leg.isValidating || leg.isValid === undefined
              ? 'text-wherelse-cream/50'
              : 'text-wherelse-cream/60'
        }`}>
          {leg.country}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <Calendar className="w-3 h-3 text-wherelse-cream/40" />
          <p className="text-xs font-mono text-wherelse-cream/50">
            {formatDate(leg.startDate)} → {formatDate(leg.endDate)}
          </p>
        </div>
        {/* Validation error message */}
        {leg.isValid === false && leg.validationError && (
          <p className="text-xs text-wherelse-red/80 mt-1 font-body">
            ⚠️ {leg.validationError}
          </p>
        )}
        {leg.isValidating && (
          <p className="text-xs text-wherelse-yellow/60 mt-1 font-body">
            Verifying location...
          </p>
        )}
      </div>
      
      {/* Actions */}
      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => onEdit(leg.id)}
          className="p-2 text-wherelse-cream/50 hover:text-wherelse-yellow transition-colors"
          title="Edit"
        >
          <Edit2 className="w-4 h-4" />
        </button>
        <button
          onClick={() => onDelete(leg.id)}
          className="p-2 text-wherelse-cream/50 hover:text-wherelse-red transition-colors"
          title="Delete"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default function DraggableLegList({ legs, onReorder, onEdit, onDelete, formatDate }) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  
  const handleDragEnd = (event) => {
    const { active, over } = event;
    
    if (active.id !== over.id) {
      const oldIndex = legs.findIndex(leg => leg.id === active.id);
      const newIndex = legs.findIndex(leg => leg.id === over.id);
      
      const reorderedLegs = arrayMove(legs, oldIndex, newIndex);
      onReorder(reorderedLegs);
    }
  };
  
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={legs.map(leg => leg.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-3">
          {legs.map((leg, index) => (
            <SortableLegItem
              key={leg.id}
              leg={leg}
              index={index}
              onEdit={onEdit}
              onDelete={onDelete}
              formatDate={formatDate}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

