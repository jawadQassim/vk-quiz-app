"use client";
/* eslint-disable @next/next/no-img-element */

import {
  useEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import {
  RealtimeStatusBanner,
  type RealtimeConnectionState,
} from "@/components/realtime-status";
import {
  clearParticipantSessionRef,
  readParticipantSessionRef,
  type ParticipantSessionRef,
} from "@/lib/participant-session";
import {
  getRoomSession,
  getSessionApiErrorMessage,
  submitSessionAnswer,
  type RoomSessionData,
} from "@/lib/session-api";
import {
  getSocketClient,
  subscribeToSessionSocket,
  unsubscribeFromSessionSocket,
} from "@/lib/socket/client";

export default function PlayQuizPage() {
  const params = useParams<{ roomCode: string }>();

  const [sessionRef, setSessionRef] =
    useState<ParticipantSessionRef | null>(null);
  const [session, setSession] =
    useState<RoomSessionData | null>(null);
  const [selectedOptionIds, setSelectedOptionIds] = useState<
    string[]
  >([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [connectionState, setConnectionState] =
    useState<RealtimeConnectionState>("connecting");

  const currentQuestionIdRef = useRef<string | null>(null);

  function applyLoadedSession(nextSession: RoomSessionData) {
    const nextQuestionId = nextSession.currentQuestion?.id ?? null;

    setSelectedOptionIds((currentIds) => {
      if (nextSession.currentAnswer) {
        return nextSession.currentAnswer.selectedOptionIds;
      }

      if (currentQuestionIdRef.current !== nextQuestionId) {
        return [];
      }

      const validOptionIds = new Set(
        nextSession.currentQuestion?.options.map(
          (option) => option.id,
        ) ?? [],
      );

      return currentIds.filter((id) => validOptionIds.has(id));
    });

    currentQuestionIdRef.current = nextQuestionId;
    setSession(nextSession);
  }

  useEffect(() => {
    let isActive = true;

    async function restoreSessionRef() {
      const storedSessionRef = readParticipantSessionRef();

      if (!isActive) {
        return;
      }

      if (
        !storedSessionRef ||
        storedSessionRef.roomCode !== params.roomCode
      ) {
        clearParticipantSessionRef();
        currentQuestionIdRef.current = null;
        setSessionRef(null);
        setSession(null);
        setSelectedOptionIds([]);
        setError(
          "Сессия участника не найдена. Присоединитесь к квизу заново.",
        );
        setIsLoading(false);
        return;
      }

      currentQuestionIdRef.current = null;
      setSessionRef(storedSessionRef);
      setError("");
    }

    void restoreSessionRef();

    return () => {
      isActive = false;
    };
  }, [params.roomCode]);

  useEffect(() => {
    if (!sessionRef) {
      return;
    }

    let isActive = true;
    const participantId = sessionRef.participantId;

    async function loadSession() {
      try {
        const response = await getRoomSession(
          params.roomCode,
          participantId,
        );

        if (!isActive) {
          return;
        }

        if (
          !response.session.participant ||
          response.session.participant.id !== participantId
        ) {
          clearParticipantSessionRef();
          currentQuestionIdRef.current = null;
          setSessionRef(null);
          setSession(null);
          setSelectedOptionIds([]);
          setError(
            "Не удалось восстановить участника. Войдите в квиз ещё раз.",
          );
          return;
        }

        applyLoadedSession(response.session);
        setError("");
      } catch (loadError) {
        if (!isActive) {
          return;
        }

        setError(
          getSessionApiErrorMessage(
            loadError,
            "Не удалось загрузить состояние квиза.",
          ),
        );
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadSession();

    return () => {
      isActive = false;
    };
  }, [params.roomCode, reloadKey, sessionRef]);

  useEffect(() => {
    if (!sessionRef) {
      return;
    }

    const activeSessionRef = sessionRef;
    const socket = getSocketClient();
    let isActive = true;

    async function subscribe() {
      setConnectionState("connecting");

      const result = await subscribeToSessionSocket({
        role: "participant",
        sessionId: activeSessionRef.sessionId,
        roomCode: activeSessionRef.roomCode,
        participantId: activeSessionRef.participantId,
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

    function handleQuizUpdate(payload: {
      sessionId: string;
    }) {
      if (
        !isActive ||
        payload.sessionId !== activeSessionRef.sessionId
      ) {
        return;
      }

      setError("");
      setReloadKey((currentKey) => currentKey + 1);
    }

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("socket:error", handleSocketError);
    socket.on("quiz:started", handleQuizUpdate);
    socket.on("quiz:question-changed", handleQuizUpdate);
    socket.on("quiz:finished", handleQuizUpdate);

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
      socket.off("quiz:started", handleQuizUpdate);
      socket.off("quiz:question-changed", handleQuizUpdate);
      socket.off("quiz:finished", handleQuizUpdate);

      if (socket.connected) {
        void unsubscribeFromSessionSocket(
          activeSessionRef.sessionId,
        );
      }
    };
  }, [sessionRef]);

  const participant = session?.participant ?? null;
  const currentQuestion = session?.currentQuestion ?? null;
  const currentAnswer = session?.currentAnswer ?? null;
  const isAnswered = currentAnswer !== null;

  function toggleAnswer(optionId: string) {
    if (
      !currentQuestion ||
      isAnswered ||
      isSubmitting
    ) {
      return;
    }

    if (currentQuestion.type === "single") {
      setSelectedOptionIds([optionId]);
      return;
    }

    setSelectedOptionIds((currentIds) =>
      currentIds.includes(optionId)
        ? currentIds.filter((id) => id !== optionId)
        : [...currentIds, optionId],
    );
  }

  async function handleSubmitAnswer() {
    if (
      !sessionRef ||
      !session ||
      !currentQuestion ||
      isSubmitting
    ) {
      return;
    }

    if (selectedOptionIds.length === 0) {
      setError("Выберите хотя бы один вариант ответа.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const response = await submitSessionAnswer(session.id, {
        participantId: sessionRef.participantId,
        questionId: currentQuestion.id,
        selectedOptionIds,
      });

      setSession((currentSession) => {
        if (!currentSession || !currentSession.participant) {
          return currentSession;
        }

        return {
          ...currentSession,
          participant: {
            ...currentSession.participant,
            score: response.answer.score,
            correctAnswers:
              currentSession.participant.correctAnswers +
              (response.answer.isCorrect ? 1 : 0),
          },
          currentAnswer: {
            questionId: response.answer.questionId,
            selectedOptionIds:
              response.answer.selectedOptionIds,
            isCorrect: response.answer.isCorrect,
            scoreAwarded: response.answer.scoreAwarded,
            correctOptionIds:
              response.answer.correctOptionIds,
          },
        };
      });

      setSelectedOptionIds(response.answer.selectedOptionIds);
    } catch (submitError) {
      setError(
        getSessionApiErrorMessage(
          submitError,
          "Не удалось отправить ответ.",
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
        <div className="mx-auto max-w-3xl">
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-400">
              Подключение к игре
            </p>

            <h1 className="mt-4 text-3xl font-bold">
              Загружаем текущую сессию...
            </h1>

            <p className="mt-3 text-slate-400">
              Проверяем участника, активную комнату и текущий
              вопрос.
            </p>
          </section>
        </div>
      </main>
    );
  }

  if (!session || !participant) {
    return (
      <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
        <div className="mx-auto max-w-3xl">
          <Link
            href="/join"
            className="text-sky-400 hover:text-sky-300"
          >
            ← Вернуться к входу
          </Link>

          <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-8">
            <h1 className="text-2xl font-bold">
              Сессия участника не найдена
            </h1>

            <p className="mt-3 text-slate-400">
              Чтобы продолжить, снова введите имя и код комнаты.
            </p>

            {sessionRef && (
              <RealtimeStatusBanner
                state={connectionState}
                className="mt-6"
                showWhenConnected
              />
            )}

            {error && (
              <p className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-red-300">
                {error}
              </p>
            )}
          </div>
        </div>
      </main>
    );
  }

  if (session.status === "finished") {
    return (
      <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
        <div className="mx-auto max-w-3xl">
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-400">
              Квиз завершён
            </p>

            <h1 className="mt-4 text-4xl font-bold">
              Отличная работа, {participant.name}!
            </h1>

            <p className="mt-6 text-slate-400">
              Ваш итоговый результат
            </p>

            <p className="mt-2 text-6xl font-bold text-sky-400">
              {participant.score}
            </p>

            <p className="mt-2 text-slate-400">баллов</p>

            <Link
              href={`/leaderboard/${session.roomCode}`}
              className="mt-8 inline-block rounded-xl bg-sky-500 px-6 py-3 font-semibold transition hover:bg-sky-400"
            >
              Посмотреть лидерборд
            </Link>

            <RealtimeStatusBanner
              state={connectionState}
              className="mt-6"
              showWhenConnected
            />
          </section>
        </div>
      </main>
    );
  }

  if (session.status === "waiting") {
    return (
      <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
        <div className="mx-auto max-w-3xl">
          <Link
            href="/"
            className="text-sky-400 hover:text-sky-300"
          >
            ← На главную
          </Link>

          <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-400">
              {session.quiz.title}
            </p>

            <h1 className="mt-4 text-3xl font-bold">
              Ожидание старта квиза
            </h1>

            <p className="mt-3 text-slate-400">
              Организатор ещё не начал игру. Как только сессия
              станет активной, этот экран обновится автоматически.
            </p>

            <p className="mt-6 text-lg">
              Участник:{" "}
              <strong className="text-white">
                {participant.name}
              </strong>
            </p>

            <RealtimeStatusBanner
              state={connectionState}
              className="mt-6"
              showWhenConnected
            />

            {error && (
              <p className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-red-300">
                {error}
              </p>
            )}
          </section>
        </div>
      </main>
    );
  }

  if (!currentQuestion) {
    return (
      <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
        <div className="mx-auto max-w-3xl">
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-400">
              {session.quiz.title}
            </p>

            <h1 className="mt-4 text-3xl font-bold">
              Ждём следующий вопрос
            </h1>

            <p className="mt-3 text-slate-400">
              Состояние квиза обновится автоматически.
            </p>

            <RealtimeStatusBanner
              state={connectionState}
              className="mt-6"
              showWhenConnected
            />

            {error && (
              <p className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-red-300">
                {error}
              </p>
            )}
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
      <div className="mx-auto max-w-4xl">
        <header className="flex flex-col gap-4 border-b border-slate-800 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-400">
              {session.quiz.title}
            </p>

            <h1 className="mt-2 text-2xl font-bold">
              Участник: {participant.name}
            </h1>

            <p className="mt-2 text-slate-400">
              Вопрос {currentQuestion.questionNumber} из{" "}
              {currentQuestion.totalQuestions}
            </p>
          </div>

          <div className="rounded-xl bg-slate-900 px-5 py-3">
            <p className="text-sm text-slate-400">Баллы</p>
            <p className="text-2xl font-bold">
              {participant.score}
            </p>
          </div>
        </header>

        {error && (
          <p className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-red-300">
            {error}
          </p>
        )}

        <RealtimeStatusBanner
          state={connectionState}
          className="mt-6"
          showWhenConnected
        />

        <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-400">
              Вопрос {currentQuestion.questionNumber}
            </p>

            <p className="text-sm text-slate-400">
              {currentQuestion.questionNumber} /{" "}
              {currentQuestion.totalQuestions}
            </p>
          </div>

          <h2 className="mt-4 text-3xl font-bold">
            {currentQuestion.text}
          </h2>

          {currentQuestion.imageUrl && (
            <img
              src={currentQuestion.imageUrl}
              alt="Изображение вопроса"
              className="mt-6 max-h-80 w-full rounded-2xl object-cover"
            />
          )}

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {currentQuestion.options.map((option, optionIndex) => {
              const isSelected =
                selectedOptionIds.includes(option.id);
              const isCorrect = Boolean(
                currentAnswer?.correctOptionIds.includes(
                  option.id,
                ),
              );

              let optionClasses =
                "border-slate-700 bg-slate-950 hover:border-sky-500";

              if (isSelected) {
                optionClasses =
                  "border-sky-500 bg-sky-500/10";
              }

              if (isAnswered && isCorrect) {
                optionClasses =
                  "border-emerald-500 bg-emerald-500/10";
              }

              if (isAnswered && isSelected && !isCorrect) {
                optionClasses =
                  "border-red-500 bg-red-500/10";
              }

              return (
                <button
                  key={option.id}
                  type="button"
                  disabled={isAnswered || isSubmitting}
                  onClick={() => toggleAnswer(option.id)}
                  className={`rounded-xl border px-5 py-4 text-left font-semibold transition ${optionClasses} disabled:cursor-not-allowed disabled:opacity-80`}
                >
                  {optionIndex + 1}. {option.text}
                </button>
              );
            })}
          </div>

          {currentAnswer && (
            <div className="mt-6 rounded-xl border border-slate-700 bg-slate-950 px-5 py-4">
              <p className="font-semibold">
                {currentAnswer.isCorrect
                  ? `Правильный ответ! +${currentAnswer.scoreAwarded} баллов.`
                  : "Ответ принят. В этот раз без баллов."}
              </p>

              <p className="mt-2 text-sm text-slate-400">
                Ждём следующий вопрос от организатора...
              </p>
            </div>
          )}

          <div className="mt-8 flex justify-end">
            <button
              type="button"
              onClick={() => {
                void handleSubmitAnswer();
              }}
              disabled={isAnswered || isSubmitting}
              className="rounded-xl bg-sky-500 px-8 py-3 font-semibold transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting
                ? "Отправляем..."
                : isAnswered
                  ? "Ответ отправлен"
                  : "Ответить"}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
