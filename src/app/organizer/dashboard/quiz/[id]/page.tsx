"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import {
  RealtimeStatusBanner,
  type RealtimeConnectionState,
} from "@/components/realtime-status";
import {
  getOrganizerApiErrorMessage,
  getOrganizerQuiz,
  isUnauthorizedError,
  type OrganizerQuiz,
  type OrganizerQuizStatus,
} from "@/lib/organizer-api";
import {
  createQuizSession,
  getQuizSessionLeaderboard,
  getQuizSessionParticipants,
  getSessionApiErrorMessage,
  isSessionUnauthorizedError,
  updateQuizSession,
  type OrganizerSessionSummary,
  type SessionLeaderboardData,
  type SessionParticipantsData,
} from "@/lib/session-api";
import {
  getSocketClient,
  subscribeToSessionSocket,
  unsubscribeFromSessionSocket,
} from "@/lib/socket/client";

type Feedback = {
  text: string;
  tone: "info" | "error";
};

function getStatusLabel(status: OrganizerQuizStatus) {
  if (status === "draft") {
    return "Черновик";
  }

  if (status === "active") {
    return "Активен";
  }

  return "Завершён";
}

function applySessionToQuiz(
  quiz: OrganizerQuiz,
  session: OrganizerSessionSummary,
): OrganizerQuiz {
  return {
    ...quiz,
    status: session.quiz.status,
    roomCode: session.roomCode,
    currentQuestionIndex: session.currentQuestionIndex,
    participantCount: session.participantCount,
    session: {
      id: session.id,
      roomCode: session.roomCode,
      status: session.status,
      currentQuestionIndex: session.currentQuestionIndex,
      startedAt: session.startedAt,
      finishedAt: session.finishedAt,
      participants: session.participants,
    },
  };
}

function getQuizStatusFromSessionStatus(
  status: OrganizerSessionSummary["status"],
): OrganizerQuizStatus {
  if (status === "active") {
    return "active";
  }

  if (status === "finished") {
    return "finished";
  }

  return "draft";
}

function applyParticipantsToQuiz(
  quiz: OrganizerQuiz,
  session: SessionParticipantsData,
): OrganizerQuiz {
  if (!quiz.session || quiz.session.id !== session.id) {
    return quiz;
  }

  return {
    ...quiz,
    participantCount: session.participantCount,
    session: {
      ...quiz.session,
      status: session.status,
      participants: session.participants,
    },
  };
}

function applyRealtimeSessionState(
  quiz: OrganizerQuiz,
  payload: {
    status: OrganizerSessionSummary["status"];
    currentQuestionIndex: number;
    startedAt?: string | null;
    finishedAt?: string | null;
  },
): OrganizerQuiz {
  if (!quiz.session) {
    return quiz;
  }

  return {
    ...quiz,
    status: getQuizStatusFromSessionStatus(payload.status),
    currentQuestionIndex: payload.currentQuestionIndex,
    session: {
      ...quiz.session,
      status: payload.status,
      currentQuestionIndex: payload.currentQuestionIndex,
      startedAt:
        payload.startedAt === undefined
          ? quiz.session.startedAt
          : payload.startedAt,
      finishedAt:
        payload.finishedAt === undefined
          ? quiz.session.finishedAt
          : payload.finishedAt,
    },
  };
}

export default function QuizControlPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const [quiz, setQuiz] = useState<OrganizerQuiz | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] =
    useState(0);
  const [sessionParticipants, setSessionParticipants] =
    useState<SessionParticipantsData | null>(null);
  const [sessionLeaderboard, setSessionLeaderboard] =
    useState<SessionLeaderboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [isQuestionUpdating, setIsQuestionUpdating] =
    useState(false);
  const [statusMutation, setStatusMutation] = useState<
    OrganizerQuizStatus | null
  >(null);
  const [connectionState, setConnectionState] =
    useState<RealtimeConnectionState>("connecting");

  useEffect(() => {
    let isActive = true;

    async function loadQuiz() {
      try {
        const response = await getOrganizerQuiz(params.id);

        if (!isActive) {
          return;
        }

        const nextQuiz = response.quiz;
        const nextQuestionIndex = Math.min(
          nextQuiz.currentQuestionIndex,
          Math.max(nextQuiz.questions.length - 1, 0),
        );

        setQuiz(nextQuiz);
        setCurrentQuestionIndex(nextQuestionIndex);
        setError("");

        if (nextQuiz.session) {
          const [participantsResponse, leaderboardResponse] =
            await Promise.all([
              getQuizSessionParticipants(nextQuiz.session.id),
              getQuizSessionLeaderboard(nextQuiz.session.id),
            ]);

          if (!isActive) {
            return;
          }

          setSessionParticipants(participantsResponse.session);
          setSessionLeaderboard(leaderboardResponse.leaderboard);
        } else {
          setSessionParticipants(null);
          setSessionLeaderboard(null);
        }
      } catch (loadError) {
        if (!isActive) {
          return;
        }

        if (
          isUnauthorizedError(loadError) ||
          isSessionUnauthorizedError(loadError)
        ) {
          router.replace("/organizer?reason=auth");
          router.refresh();
          return;
        }

        setError(
          loadError instanceof Error &&
            "status" in loadError
            ? getSessionApiErrorMessage(
                loadError,
                "Не удалось загрузить данные сессии.",
              )
            : getOrganizerApiErrorMessage(
                loadError,
                "Не удалось загрузить квиз.",
              ),
        );
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadQuiz();

    return () => {
      isActive = false;
    };
  }, [params.id, reloadKey, router]);

  useEffect(() => {
    const sessionId = quiz?.session?.id;

    if (!sessionId) {
      return;
    }

    const activeSessionId = sessionId;
    const socket = getSocketClient();
    let isActive = true;

    async function subscribe() {
      setConnectionState("connecting");

      const result = await subscribeToSessionSocket({
        role: "organizer",
        sessionId: activeSessionId,
      });

      if (!isActive) {
        return;
      }

      if (!result.ok) {
        setConnectionState("disconnected");
        setError(
          result.error ??
            "Не удалось подключить обновления сессии.",
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

    function handleParticipantJoin(payload: {
      sessionId: string;
      participant: {
        name: string;
      };
    }) {
      if (!isActive || payload.sessionId !== sessionId) {
        return;
      }

      setFeedback({
        text: `${payload.participant.name} присоединился к игре.`,
        tone: "info",
      });
    }

    function handleParticipantListUpdated(
      payload: SessionParticipantsData,
    ) {
      if (!isActive || payload.id !== sessionId) {
        return;
      }

      setSessionParticipants(payload);
      setQuiz((currentQuiz) =>
        currentQuiz
          ? applyParticipantsToQuiz(currentQuiz, payload)
          : currentQuiz,
      );
      setError("");
    }

    function handleQuizStarted(payload: {
      sessionId: string;
      status: OrganizerSessionSummary["status"];
      currentQuestionIndex: number;
      startedAt: string | null;
    }) {
      if (!isActive || payload.sessionId !== sessionId) {
        return;
      }

      setCurrentQuestionIndex(payload.currentQuestionIndex);
      setQuiz((currentQuiz) =>
        currentQuiz
          ? applyRealtimeSessionState(currentQuiz, payload)
          : currentQuiz,
      );
      setError("");
    }

    function handleQuizQuestionChanged(payload: {
      sessionId: string;
      status: OrganizerSessionSummary["status"];
      currentQuestionIndex: number;
    }) {
      if (!isActive || payload.sessionId !== sessionId) {
        return;
      }

      setCurrentQuestionIndex(payload.currentQuestionIndex);
      setQuiz((currentQuiz) =>
        currentQuiz
          ? applyRealtimeSessionState(currentQuiz, payload)
          : currentQuiz,
      );
      setError("");
    }

    function handleQuizFinished(payload: {
      sessionId: string;
      status: OrganizerSessionSummary["status"];
      currentQuestionIndex: number;
      finishedAt: string | null;
    }) {
      if (!isActive || payload.sessionId !== sessionId) {
        return;
      }

      setCurrentQuestionIndex(payload.currentQuestionIndex);
      setQuiz((currentQuiz) =>
        currentQuiz
          ? applyRealtimeSessionState(currentQuiz, payload)
          : currentQuiz,
      );
      setFeedback({
        text: "Квиз завершён.",
        tone: "info",
      });
      setError("");
    }

    function handleLeaderboardUpdated(
      payload: SessionLeaderboardData,
    ) {
      if (!isActive || payload.sessionId !== sessionId) {
        return;
      }

      setSessionLeaderboard(payload);
      setError("");
    }

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("socket:error", handleSocketError);
    socket.on("participant:join", handleParticipantJoin);
    socket.on(
      "participant:list-updated",
      handleParticipantListUpdated,
    );
    socket.on("quiz:started", handleQuizStarted);
    socket.on(
      "quiz:question-changed",
      handleQuizQuestionChanged,
    );
    socket.on("quiz:finished", handleQuizFinished);
    socket.on(
      "leaderboard:updated",
      handleLeaderboardUpdated,
    );

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
      socket.off("participant:join", handleParticipantJoin);
      socket.off(
        "participant:list-updated",
        handleParticipantListUpdated,
      );
      socket.off("quiz:started", handleQuizStarted);
      socket.off(
        "quiz:question-changed",
        handleQuizQuestionChanged,
      );
      socket.off("quiz:finished", handleQuizFinished);
      socket.off(
        "leaderboard:updated",
        handleLeaderboardUpdated,
      );

      if (socket.connected) {
        void unsubscribeFromSessionSocket(activeSessionId);
      }
    };
  }, [quiz?.session?.id]);

  const currentQuestion =
    quiz?.questions[currentQuestionIndex] ?? null;
  const participantCount =
    sessionParticipants?.participantCount ??
    quiz?.participantCount ??
    0;

  async function handleStatusUpdate(
    nextStatus: OrganizerQuizStatus,
  ) {
    if (!quiz) {
      return;
    }

    setStatusMutation(nextStatus);
    setFeedback(null);
    setError("");

    try {
      if (nextStatus === "active") {
        const response = await createQuizSession({
          quizId: quiz.id,
        });

        setQuiz((currentQuiz) =>
          currentQuiz
            ? applySessionToQuiz(currentQuiz, response.session)
            : currentQuiz,
        );
        setCurrentQuestionIndex(
          response.session.currentQuestionIndex,
        );
        setSessionParticipants({
          id: response.session.id,
          roomCode: response.session.roomCode,
          status: response.session.status,
          participantCount: response.session.participantCount,
          participants: response.session.participants,
        });

        const leaderboardResponse =
          await getQuizSessionLeaderboard(response.session.id);

        setSessionLeaderboard(leaderboardResponse.leaderboard);
        setFeedback({
          text: `Квиз запущен. Код комнаты: ${response.session.roomCode}`,
          tone: "info",
        });
      } else {
        if (!quiz.session) {
          setFeedback({
            text: "Для этого действия сначала создайте сессию.",
            tone: "error",
          });
          return;
        }

        const response = await updateQuizSession(quiz.session.id, {
          status:
            nextStatus === "finished"
              ? "finished"
              : "waiting",
          currentQuestionIndex:
            nextStatus === "finished"
              ? currentQuestionIndex
              : 0,
        });

        setQuiz((currentQuiz) =>
          currentQuiz
            ? applySessionToQuiz(currentQuiz, response.session)
            : currentQuiz,
        );
        setCurrentQuestionIndex(
          response.session.currentQuestionIndex,
        );
        setSessionParticipants({
          id: response.session.id,
          roomCode: response.session.roomCode,
          status: response.session.status,
          participantCount: response.session.participantCount,
          participants: response.session.participants,
        });

        const leaderboardResponse =
          await getQuizSessionLeaderboard(response.session.id);

        setSessionLeaderboard(leaderboardResponse.leaderboard);
        setFeedback({
          text:
            nextStatus === "finished"
              ? "Квиз завершён."
              : "Квиз возвращён в черновик.",
          tone: "info",
        });
      }

      setReloadKey((currentKey) => currentKey + 1);
    } catch (statusError) {
      if (
        isUnauthorizedError(statusError) ||
        isSessionUnauthorizedError(statusError)
      ) {
        router.replace("/organizer?reason=auth");
        router.refresh();
        return;
      }

      setFeedback({
        text: getSessionApiErrorMessage(
          statusError,
          "Не удалось обновить статус квиза.",
        ),
        tone: "error",
      });
    } finally {
      setStatusMutation(null);
    }
  }

  async function persistCurrentQuestionIndex(nextIndex: number) {
    if (!quiz?.session) {
      setFeedback({
        text: "Сначала запустите квиз, чтобы переключать вопросы.",
        tone: "error",
      });
      return;
    }

    setIsQuestionUpdating(true);
    setFeedback(null);
    setError("");

    try {
      const response = await updateQuizSession(quiz.session.id, {
        currentQuestionIndex: nextIndex,
      });

      setQuiz((currentQuiz) =>
        currentQuiz
          ? applySessionToQuiz(currentQuiz, response.session)
          : currentQuiz,
      );
      setCurrentQuestionIndex(response.session.currentQuestionIndex);
    } catch (updateError) {
      if (
        isUnauthorizedError(updateError) ||
        isSessionUnauthorizedError(updateError)
      ) {
        router.replace("/organizer?reason=auth");
        router.refresh();
        return;
      }

      setFeedback({
        text: getSessionApiErrorMessage(
          updateError,
          "Не удалось переключить вопрос.",
        ),
        tone: "error",
      });
    } finally {
      setIsQuestionUpdating(false);
    }
  }

  function showNextQuestion() {
    if (!quiz) {
      return;
    }

    if (currentQuestionIndex >= quiz.questions.length - 1) {
      setFeedback({
        text: "Это последний вопрос.",
        tone: "info",
      });
      return;
    }

    void persistCurrentQuestionIndex(currentQuestionIndex + 1);
  }

  function showPreviousQuestion() {
    if (currentQuestionIndex === 0) {
      setFeedback({
        text: "Это первый вопрос.",
        tone: "info",
      });
      return;
    }

    void persistCurrentQuestionIndex(currentQuestionIndex - 1);
  }

  if (isLoading) {
    return (
      <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
        <div className="mx-auto max-w-6xl">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-10 text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-400">
              Управление квизом
            </p>
            <h1 className="mt-3 text-3xl font-bold">
              Загружаем квиз...
            </h1>
            <p className="mt-3 text-slate-400">
              Получаем вопросы, текущую сессию и состояние
              лидерборда.
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (!quiz) {
    return (
      <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
        <div className="mx-auto max-w-4xl">
          <Link
            href="/organizer/dashboard"
            className="text-sky-400 hover:text-sky-300"
          >
            ← Вернуться в панель
          </Link>

          <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-8">
            <h1 className="text-2xl font-bold">
              Квиз не найден
            </h1>

            {error && (
              <p className="mt-3 text-red-300">{error}</p>
            )}

            <button
              type="button"
              onClick={() => {
                setIsLoading(true);
                setError("");
                setReloadKey((currentKey) => currentKey + 1);
              }}
              className="mt-6 rounded-xl bg-sky-500 px-6 py-3 font-semibold transition hover:bg-sky-400"
            >
              Попробовать снова
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
      <div className="mx-auto max-w-6xl">
        <Link
          href="/organizer/dashboard"
          className="text-sm text-sky-400 hover:text-sky-300"
        >
          ← Вернуться в панель
        </Link>

        <header className="mt-6 flex flex-col gap-6 border-b border-slate-800 pb-8 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-400">
              Управление квизом
            </p>

            <h1 className="mt-2 text-4xl font-bold">
              {quiz.title}
            </h1>

            <p className="mt-3 max-w-2xl text-slate-400">
              {quiz.description || "Описание отсутствует"}
            </p>

            <div className="mt-5 flex flex-wrap gap-3 text-sm">
              <span className="rounded-lg bg-slate-900 px-3 py-2 text-slate-300">
                Категория: {quiz.category}
              </span>

              <span className="rounded-lg bg-slate-900 px-3 py-2 text-slate-300">
                Вопросов: {quiz.questions.length}
              </span>

              <span className="rounded-lg bg-slate-900 px-3 py-2 text-slate-300">
                Время: {quiz.timePerQuestion} сек.
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-sky-500/30 bg-sky-500/10 p-6 text-center lg:min-w-64">
            <p className="text-sm text-slate-300">
              Код комнаты
            </p>

            <p className="mt-2 text-4xl font-bold tracking-[0.2em] text-sky-400">
              {quiz.roomCode ?? "------"}
            </p>

            <p className="mt-3 text-sm text-slate-400">
              Передайте этот код участникам.
            </p>
          </div>
        </header>

        {feedback && (
          <p
            className={`mt-6 rounded-xl px-5 py-4 ${
              feedback.tone === "error"
                ? "border border-red-500/30 bg-red-500/10 text-red-300"
                : "border border-sky-500/30 bg-sky-500/10 text-sky-300"
            }`}
          >
            {feedback.text}
          </p>
        )}

        {error && (
          <p className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-red-300">
            {error}
          </p>
        )}

        {quiz.session && (
          <RealtimeStatusBanner
            state={connectionState}
            className="mt-6"
            showWhenConnected
          />
        )}

        <section className="mt-8 grid gap-5 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <p className="text-sm text-slate-400">Статус</p>

            <p className="mt-2 text-2xl font-bold">
              {getStatusLabel(quiz.status)}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <p className="text-sm text-slate-400">Участники</p>
            <p className="mt-2 text-2xl font-bold">
              {participantCount}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <p className="text-sm text-slate-400">
              Текущий вопрос
            </p>

            <p className="mt-2 text-2xl font-bold">
              {currentQuestionIndex + 1} / {quiz.questions.length}
            </p>
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-bold">
                Управление запуском
              </h2>

              <p className="mt-2 text-slate-400">
                Запускайте квиз, переключайте вопросы и
                завершайте игровую сессию через реальные API
                маршруты.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              {quiz.status !== "active" && (
                <button
                  type="button"
                  onClick={() => {
                    void handleStatusUpdate("active");
                  }}
                  disabled={statusMutation !== null}
                  className="rounded-xl bg-emerald-500 px-6 py-3 font-semibold text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {statusMutation === "active"
                    ? "Запускаем..."
                    : "Запустить квиз"}
                </button>
              )}

              {quiz.status === "active" && (
                <button
                  type="button"
                  onClick={() => {
                    void handleStatusUpdate("finished");
                  }}
                  disabled={statusMutation !== null}
                  className="rounded-xl bg-red-500 px-6 py-3 font-semibold text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {statusMutation === "finished"
                    ? "Завершаем..."
                    : "Завершить квиз"}
                </button>
              )}

              {quiz.status !== "draft" && (
                <button
                  type="button"
                  onClick={() => {
                    void handleStatusUpdate("draft");
                  }}
                  disabled={statusMutation !== null}
                  className="rounded-xl border border-slate-700 px-6 py-3 font-semibold transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {statusMutation === "draft"
                    ? "Возвращаем..."
                    : "Вернуть в черновик"}
                </button>
              )}
            </div>
          </div>
        </section>

        {currentQuestion && (
          <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-400">
              Вопрос {currentQuestionIndex + 1}
            </p>

            <h2 className="mt-3 text-3xl font-bold">
              {currentQuestion.text}
            </h2>

            {currentQuestion.imageUrl && (
              <img
                src={currentQuestion.imageUrl}
                alt="Изображение вопроса"
                className="mt-6 max-h-80 w-full rounded-2xl object-cover"
              />
            )}

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {currentQuestion.options.map((option, optionIndex) => {
                const isCorrect =
                  currentQuestion.correctAnswers.includes(
                    optionIndex,
                  );

                return (
                  <div
                    key={option.id}
                    className={`rounded-xl border px-5 py-4 ${
                      isCorrect
                        ? "border-emerald-500/50 bg-emerald-500/10"
                        : "border-slate-700 bg-slate-950"
                    }`}
                  >
                    <span className="font-semibold">
                      {optionIndex + 1}. {option.text}
                    </span>

                    {isCorrect && (
                      <span className="ml-2 text-sm text-emerald-400">
                        Правильный ответ
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-between">
              <button
                type="button"
                onClick={showPreviousQuestion}
                disabled={
                  isQuestionUpdating || quiz.status !== "active"
                }
                className="rounded-xl border border-slate-700 px-6 py-3 font-semibold transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isQuestionUpdating
                  ? "Обновляем..."
                  : "← Предыдущий вопрос"}
              </button>

              <button
                type="button"
                onClick={showNextQuestion}
                disabled={
                  isQuestionUpdating || quiz.status !== "active"
                }
                className="rounded-xl bg-sky-500 px-6 py-3 font-semibold transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isQuestionUpdating
                  ? "Обновляем..."
                  : "Следующий вопрос →"}
              </button>
            </div>
          </section>
        )}

        <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-2xl font-bold">Участники</h2>

          <p className="mt-2 text-slate-400">
            Количество и список участников подтягиваются из
            активной или последней сессии и сохраняются после
            обновления страницы.
          </p>

          {sessionParticipants?.participants.length ? (
            <div className="mt-6 grid gap-3">
              {sessionParticipants.participants.map(
                (participant, index) => (
                  <article
                    key={participant.id}
                    className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-950 px-5 py-4"
                  >
                    <div>
                      <p className="text-sm text-slate-400">
                        #{index + 1}
                      </p>
                      <h3 className="text-lg font-semibold">
                        {participant.name}
                      </h3>
                    </div>

                    <p className="text-2xl font-bold text-sky-400">
                      {participant.score}
                    </p>
                  </article>
                ),
              )}
            </div>
          ) : (
            <div className="mt-6 rounded-xl border border-dashed border-slate-700 p-8 text-center text-slate-400">
              Участников пока нет
            </div>
          )}
        </section>

        <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-2xl font-bold">Лидерборд</h2>

          <p className="mt-2 text-slate-400">
            Результаты берутся из базы данных и остаются
            доступными после перезагрузки.
          </p>

          {sessionLeaderboard?.participants.length ? (
            <div className="mt-6 grid gap-3">
              {sessionLeaderboard.participants.map(
                (participant, index) => (
                  <article
                    key={participant.id}
                    className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-950 px-5 py-4"
                  >
                    <div>
                      <p className="text-sm text-slate-400">
                        #{index + 1}
                      </p>
                      <h3 className="text-lg font-semibold">
                        {participant.name}
                      </h3>
                      <p className="text-sm text-slate-400">
                        Правильных ответов:{" "}
                        {participant.correctAnswers}
                      </p>
                    </div>

                    <p className="text-2xl font-bold text-sky-400">
                      {participant.score}
                    </p>
                  </article>
                ),
              )}
            </div>
          ) : (
            <div className="mt-6 rounded-xl border border-dashed border-slate-700 p-8 text-center text-slate-400">
              Результатов пока нет
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
