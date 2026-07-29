"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import {
  getOrganizerApiErrorMessage,
  loginOrganizer,
  registerOrganizer,
} from "@/lib/organizer-api";

type AuthMode = "login" | "register";

export default function OrganizerAuthClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [mode, setMode] = useState<AuthMode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const statusMessage =
    searchParams.get("loggedOut") === "1"
      ? "Вы вышли из кабинета организатора."
      : searchParams.get("reason") === "auth"
        ? "Войдите в кабинет, чтобы открыть панель организатора."
        : "";

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setError("");

    const trimmedEmail = email.trim().toLowerCase();
    const trimmedName = name.trim();

    if (mode === "register" && !trimmedName) {
      setError("Введите имя организатора.");
      return;
    }

    if (!trimmedEmail) {
      setError("Введите электронную почту.");
      return;
    }

    if (!password) {
      setError("Введите пароль.");
      return;
    }

    if (mode === "register" && password.length < 8) {
      setError("Пароль должен содержать минимум 8 символов.");
      return;
    }

    setIsSubmitting(true);

    try {
      if (mode === "register") {
        await registerOrganizer({
          name: trimmedName,
          email: trimmedEmail,
          password,
        });
      } else {
        await loginOrganizer({
          email: trimmedEmail,
          password,
        });
      }

      router.replace(
        `/organizer/dashboard?auth=${
          mode === "register" ? "registered" : "logged-in"
        }`,
      );
      router.refresh();
    } catch (submitError) {
      setError(
        getOrganizerApiErrorMessage(
          submitError,
          "Не удалось выполнить вход. Попробуйте ещё раз.",
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const isRegisterMode = mode === "register";

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-12 text-white">
      <div className="mx-auto max-w-xl">
        <Link
          href="/"
          className="mb-8 inline-block text-sm text-sky-400 hover:text-sky-300"
        >
          ← На главную
        </Link>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-400">
            Организатор
          </p>

          <h1 className="mt-3 text-3xl font-bold">
            {isRegisterMode
              ? "Регистрация организатора"
              : "Вход в кабинет организатора"}
          </h1>

          <p className="mt-3 text-slate-400">
            {isRegisterMode
              ? "Создайте аккаунт организатора, чтобы сохранять и запускать квизы."
              : "Войдите в аккаунт организатора, чтобы открыть панель с вашими квизами."}
          </p>

          <div className="mt-6 grid grid-cols-2 rounded-xl bg-slate-950 p-1">
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setError("");
              }}
              className={`rounded-lg px-4 py-3 text-sm font-semibold transition ${
                mode === "login"
                  ? "bg-sky-500 text-white"
                  : "text-slate-300 hover:bg-slate-900"
              }`}
            >
              Вход
            </button>

            <button
              type="button"
              onClick={() => {
                setMode("register");
                setError("");
              }}
              className={`rounded-lg px-4 py-3 text-sm font-semibold transition ${
                mode === "register"
                  ? "bg-sky-500 text-white"
                  : "text-slate-300 hover:bg-slate-900"
              }`}
            >
              Регистрация
            </button>
          </div>

          <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
            {isRegisterMode && (
              <div>
                <label
                  htmlFor="name"
                  className="mb-2 block text-sm font-medium text-slate-300"
                >
                  Имя
                </label>

                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    setError("");
                  }}
                  placeholder="Введите имя"
                  autoComplete="name"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none transition focus:border-sky-500"
                />
              </div>
            )}

            <div>
              <label
                htmlFor="email"
                className="mb-2 block text-sm font-medium text-slate-300"
              >
                Электронная почта
              </label>

              <input
                id="email"
                type="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setError("");
                }}
                placeholder="name@example.com"
                autoComplete="email"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none transition focus:border-sky-500"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-2 block text-sm font-medium text-slate-300"
              >
                Пароль
              </label>

              <input
                id="password"
                type="password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setError("");
                }}
                placeholder={
                  isRegisterMode
                    ? "Минимум 8 символов"
                    : "Введите пароль"
                }
                autoComplete={
                  isRegisterMode
                    ? "new-password"
                    : "current-password"
                }
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none transition focus:border-sky-500"
              />
            </div>

            {statusMessage && (
              <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
                {statusMessage}
              </p>
            )}

            {error && (
              <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-xl bg-sky-500 px-5 py-3 font-semibold transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting
                ? isRegisterMode
                  ? "Создаём аккаунт..."
                  : "Входим..."
                : isRegisterMode
                  ? "Создать аккаунт"
                  : "Войти"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
