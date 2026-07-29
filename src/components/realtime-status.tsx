export type RealtimeConnectionState =
  | "connecting"
  | "connected"
  | "disconnected";

type RealtimeStatusBannerProps = {
  state: RealtimeConnectionState;
  className?: string;
  showWhenConnected?: boolean;
};

function getStatusPresentation(state: RealtimeConnectionState) {
  if (state === "connected") {
    return {
      text: "Обновления в реальном времени подключены.",
      className:
        "border border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    };
  }

  if (state === "connecting") {
    return {
      text: "Подключаем обновления в реальном времени...",
      className:
        "border border-amber-500/30 bg-amber-500/10 text-amber-200",
    };
  }

  return {
    text: "Соединение потеряно. Пытаемся переподключиться...",
    className:
      "border border-red-500/30 bg-red-500/10 text-red-300",
  };
}

export function RealtimeStatusBanner({
  state,
  className = "",
  showWhenConnected = false,
}: RealtimeStatusBannerProps) {
  if (state === "connected" && !showWhenConnected) {
    return null;
  }

  const presentation = getStatusPresentation(state);

  return (
    <p
      className={`rounded-xl px-5 py-4 text-sm ${presentation.className} ${className}`.trim()}
    >
      {presentation.text}
    </p>
  );
}
