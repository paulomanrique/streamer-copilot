interface ProfileActionsProps {
  onCreate: () => void;
  onRename: () => void;
  onClone: () => void;
  onDelete: () => void;
}

export function ProfileActions({ onCreate, onRename, onClone, onDelete }: ProfileActionsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={onCreate} className="px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-sm transition-colors">
        New
      </button>
      <button type="button" onClick={onRename} className="px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-sm transition-colors">
        Rename
      </button>
      <button type="button" onClick={onClone} className="px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-sm transition-colors">
        Clone
      </button>
      <button type="button" onClick={onDelete} className="px-3 py-1.5 rounded bg-red-600/20 hover:bg-red-600/30 text-red-400 text-sm transition-colors">
        Delete
      </button>
    </div>
  );
}
