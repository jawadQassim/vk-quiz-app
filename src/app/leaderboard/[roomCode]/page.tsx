"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import {
  RealtimeStatusBanner,
  type RealtimeConnectionState,
} from "@/components/realtime-status";
import {
  getQuizSessionLeaderboard,
  getRoomSession,
  getSessionApiErrorMessage,
  type SessionLeaderboardData,
} from "@/lib/session-api";
import {
  getSocketClient,
  subscribeToSessionSocket,
  unsubscribeFromSessionSocket,
} from "@/lib/socket/client";

function getMedal(index: number) {
  if (index === 0) {
    return "🥇";
  }

  if (index === 1) {
    return "🥈";
  }

  if (index === 2) {
    return "🥉";
  }

  return `${index + 1}`;
}

export default function LeaderboardPage() {
  const params = useParams<{ roomCode: string }>();

  const [leaderboard, setLeaderboard] =
    useState<SessionLeaderboardData | null>(null);
  const [quizTitle, setQuizTitle] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [connectionState, setConnectionState] =
    useState<RealtimeConnectionState>("connecting");

  useEffect(() => {
    let isActive = true;

    async function loadLeaderboard() {
      try {
        const roomResponse = await getRoomSession(params.roomCode);
        const leaderboardResponse =
          await getQuizSessionLeaderboard(
            roomResponse.session.id,
          );

        if (!isActive) {
          return;
        }

        setSessionId(roomResponse.session.id);
        setQuizTitle(roomResponse.session.quiz.title);
        setLeaderboard(leaderboardResponse.leaderboard);
        setError("");
      } catch (loadError) {
        if (!isActive) {
          return;
        }

        setError(
          getSessionApiErrorMessage(
            loadError,
            "Не удалось загрузить лидерборд.",
          ),
        );
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadLeaderboard();

    return () => {
      isActive = false;
    };
  }, [params.roomCode, reloadKey]);

  useEffect(() => {
    if (!sessionId) {
      return;
    }

    const socket = getSocketClient();
    let isActive = true;

    async function subscribe() {
      setConnectionState("connecting");

      const result = await subscribeToSessionSocket({
        role: "leaderboard",
        sessionId,
        roomCode: params.roomCode,
      });

      if (!isActive) {
        return;
      }

      if (!result.ok) {
        setConnectionState("disconnected");
        setError(
          result.error ??
            "Не удалось подключить обновления лидерборда.",
        );
        return;
      }

      setConnectionState("connected");
      setError("");
      setReloadKey((currentKey) => currentKey + 1);
    }

    function handleConnect() {
      void subscribe();
    }

    function handleDisconnect() {
      if (!isActive) {
        return;
      }

      setConnectionState("disconnected");
    }

    function handleSocketError(payload: { message: string }) {
      if (!isActive) {
        return;
      }

      setConnectionState("disconnected");
      setError(payload.message);
    }

    function handleLeaderboardUpdated(
      payload: SessionLeaderboardData,
    ) {
      if (!isActive || payload.sessionId !== sessionId) {
        return;
      }

      setQuizTitle(payload.quizTitle);
      setLeaderboard(payload);
      setError("");
    }

    function handleQuizFinished(payload: {
      sessionId: string;
    }) {
      if (!isActive || payload.sessionId !== sessionId) {
        return;
      }

      setReloadKey((currentKey) => currentKey + 1);
    }

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("socket:error", handleSocketError);
    socket.on(
      "leaderboard:updated",
      handleLeaderboardUpdated,
    );
    socket.on("quiz:finished", handleQuizFinished);

    if (socket.connected) {
      void subscribe();
    } else {
      socket.connect();
    }

    return () => {
      isActive = false;
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("socket:error", handleSocketError);
      socket.off(
        "leaderboard:updated",
        handleLeaderboardUpdated,
      );
      socket.off("quiz:finished", handleQuizFinished);

      if (socket.connected) {
        void unsubscribeFromSessionSocket(sessionId);
      }
    };
  }, [params.roomCode, sessionId]);

  if (isLoading) {
    return (
      <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
        <div className="mx-auto max-w-4xl">
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-400">
              Итоговые результаты
            </p>

            <h1 className="mt-4 text-4xl font-bold">
              Загружаем лидерборд...
            </h1>

            <p className="mt-3 text-slate-400">
              Получаем актуальные результаты из базы данных.
            </p>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
      <div className="mx-auto max-w-4xl">
        <Link
          href="/"
          className="text-sm text-sky-400 hover:text-sky-300"
        >
          ← На главную
        </Link>

        <header className="mt-8 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-400">
            Итоговые результаты
          </p>

          <h1 className="mt-3 text-4xl font-bold">
            {quizTitle || leaderboard?.quizTitle || "Лидерборд"}
          </h1>

          <p className="mt-3 text-slate-400">
            Код комнаты:{" "}
            <strong className="text-white">
              {leaderboard?.roomCode ?? params.roomCode}
            </strong>
          </p>
        </header>

        {error && (
          <p className="mt-8 rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-red-300">
            {error}
          </p>
        )}

        {sessionId && (
          <RealtimeStatusBanner
            state={connectionState}
            className="mt-8"
            showWhenConnected
          />
        )}

        <section className="mt-10 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-2xl font-bold">Лидерборд</h2>

          {!leaderboard || leaderboard.participants.length === 0 ? (
            <div className="mt-6 rounded-xl border border-dashed border-slate-700 p-10 text-center">
              <h3 className="text-xl font-semibold">
                Результатов пока нет
              </h3>

              <p className="mt-2 text-slate-400">
                Здесь появятся участники, как только начнут
                отвечать на вопросы.
              </p>
            </div>
          ) : (
            <div className="mt-6 space-y-3">
              {leaderboard.participants.map(
                (participant, index) => (
                  <article
                    key={participant.id}
                    className={`flex items-center justify-between rounded-xl border px-5 py-4 ${
                      index === 0
                        ? "border-yellow-500/50 bg-yellow-500/10"
                        : "border-slate-700 bg-slate-950"
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-800 text-xl font-bold">
                        {getMedal(index)}
                      </div>

                      <div>
                        <h3 className="text-lg font-semibold">
                          {participant.name}
                        </h3>

                        <p className="text-sm text-slate-400">
                          Правильных ответов:{" "}
                          {participant.correctAnswers}
                        </p>
                      </div>
                    </div>

                    <div className="text-right">
                      <p className="text-2xl font-bold text-sky-400">
                        {participant.score}
                      </p>

                      <p className="text-sm text-slate-400">
                        баллов
                      </p>
                    </div>
                  </article>
                ),
              )}
            </div>
          )}
        </section>

        <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:justify-center">
          <Link
            href="/join"
            className="rounded-xl border border-slate-700 px-6 py-3 text-center font-semibold transition hover:bg-slate-900"
          >
            Пройти другой квиз
          </Link>

          <Link
            href="/"
            className="rounded-xl bg-sky-500 px-6 py-3 text-center font-semibold transition hover:bg-sky-400"
          >
            На главную
          </Link>
        </div>
      </div>
    </main>
  );
}
