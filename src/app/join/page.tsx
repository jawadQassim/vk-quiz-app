"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  writeParticipantSessionRef,
} from "@/lib/participant-session";
import {
  getRoomSession,
  getSessionApiErrorMessage,
  joinQuizSession,
} from "@/lib/session-api";

export default function JoinQuizPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const participantName = name.trim();
    const enteredCode = roomCode.trim();

    if (!participantName || !enteredCode) {
      setError("Введите имя и код комнаты.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const roomResponse = await getRoomSession(enteredCode);

      if (roomResponse.session.status === "waiting") {
        setError("Организатор еще не запустил этот квиз.");
        return;
      }

      if (roomResponse.session.status === "finished") {
        setError("Этот квиз уже завершен.");
        return;
      }

      const joinResponse = await joinQuizSession(
        roomResponse.session.id,
        {
          name: participantName,
        },
      );

      writeParticipantSessionRef({
        participantId: joinResponse.participantId,
        sessionId: joinResponse.sessionId,
        roomCode: joinResponse.roomCode,
      });

      router.push(`/play/${joinResponse.roomCode}`);
    } catch (joinError) {
      setError(
        getSessionApiErrorMessage(
          joinError,
          "Не удалось присоединиться к квизу.",
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-12 text-white">
      <div className="mx-auto max-w-xl">
        <Link
          href="/"
          className="mb-8 inline-block text-sm text-sky-400 hover:text-sky-300"
        >
          ← На главную
        </Link>

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-400">
            Участник
          </p>

          <h1 className="mt-3 text-3xl font-bold">
            Присоединиться к квизу
          </h1>

          <p className="mt-3 text-slate-400">
            Введите имя и шестизначный код комнаты,
            полученный от организатора.
          </p>

          <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
            <div>
              <label
                htmlFor="participant-name"
                className="mb-2 block text-sm font-medium text-slate-300"
              >
                Имя участника
              </label>

              <input
                id="participant-name"
                type="text"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setError("");
                }}
                placeholder="Введите имя"
                autoComplete="name"
                disabled={isSubmitting}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none transition focus:border-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>

            <div>
              <label
                htmlFor="room-code"
                className="mb-2 block text-sm font-medium text-slate-300"
              >
                Код комнаты
              </label>

              <input
                id="room-code"
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={roomCode}
                onChange={(event) => {
                  const value = event.target.value.replace(/\D/g, "");
                  setRoomCode(value);
                  setError("");
                }}
                placeholder="000000"
                disabled={isSubmitting}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-center text-3xl font-bold tracking-[0.3em] outline-none transition focus:border-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>

            {error && (
              <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-xl bg-sky-500 px-5 py-3 font-semibold transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting
                ? "Подключаем к квизу..."
                : "Войти в квиз"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
