interface StatusMessagesProps {
  isLoading: boolean;
  error: string | null;
}

export function StatusMessages({ isLoading, error }: StatusMessagesProps) {
  return (
    <>
      {isLoading ? <p className="mt-2 px-4 text-sm text-gray-400">Loading...</p> : null}
      {error ? <p className="mt-3 px-4 text-sm text-red-300">{error}</p> : null}
    </>
  );
}
