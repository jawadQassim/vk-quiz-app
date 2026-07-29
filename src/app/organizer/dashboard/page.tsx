"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  useRouter,
  useSearchParams,
} from "next/navigation";

import {
  deleteOrganizerQuiz,
  getCurrentOrganizer,
  getOrganizerApiErrorMessage,
  getOrganizerQuizzes,
  isUnauthorizedError,
  logoutOrganizer,
  type OrganizerQuiz,
  type OrganizerUser,
} from "@/lib/organizer-api";

export default function OrganizerDashboardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [organizer, setOrganizer] = useState<OrganizerUser | null>(
    null,
  );
  const [quizzes, setQuizzes] = useState<OrganizerQuiz[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [banner, setBanner] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [deletingQuizId, setDeletingQuizId] = useState<
    string | null
  >(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    let isActive = true;

    async function loadDashboard() {
      try {
        const [userResponse, quizzesResponse] = await Promise.all([
          getCurrentOrganizer(),
          getOrganizerQuizzes(),
        ]);

        if (!isActive) {
          return;
        }

        setOrganizer(userResponse.user);
        setQuizzes(quizzesResponse.quizzes);
        setError("");
      } catch (loadError) {
        if (!isActive) {
          return;
        }

        if (isUnauthorizedError(loadError)) {
          router.replace("/organizer?reason=auth");
          router.refresh();
          return;
        }

        setError(
          getOrganizerApiErrorMessage(
            loadError,
            "Не удалось загрузить панель организатора.",
          ),
        );
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadDashboard();

    return () => {
      isActive = false;
    };
  }, [reloadKey, router]);

  const pageBanner =
    searchParams.get("auth") === "registered"
      ? "Аккаунт создан. Панель организатора готова к работе."
      : searchParams.get("auth") === "logged-in"
        ? "Вход выполнен. Добро пожаловать обратно."
        : searchParams.get("created") === "1"
          ? "Квиз успешно создан."
          : "";

  const activeQuizzes = quizzes.filter(
    (quiz) => quiz.status === "active",
  ).length;

  const totalParticipants = quizzes.reduce(
    (total, quiz) => total + quiz.participantCount,
    0,
  );

  async function handleDeleteQuiz(quizId: string) {
    const confirmed = window.confirm(
      "Вы уверены, что хотите удалить этот квиз?",
    );

    if (!confirmed) {
      return;
    }

    setDeletingQuizId(quizId);
    setError("");

    try {
      await deleteOrganizerQuiz(quizId);

      setQuizzes((currentQuizzes) =>
        currentQuizzes.filter((quiz) => quiz.id !== quizId),
      );
      setBanner("Квиз удалён.");
    } catch (deleteError) {
      if (isUnauthorizedError(deleteError)) {
        router.replace("/organizer?reason=auth");
        router.refresh();
        return;
      }

      setError(
        getOrganizerApiErrorMessage(
          deleteError,
          "Не удалось удалить квиз.",
        ),
      );
    } finally {
      setDeletingQuizId(null);
    }
  }

  async function handleLogout() {
    setIsLoggingOut(true);
    setError("");

    try {
      await logoutOrganizer();
      router.replace("/organizer?loggedOut=1");
      router.refresh();
    } catch (logoutError) {
      setError(
        getOrganizerApiErrorMessage(
          logoutError,
          "Не удалось выполнить выход из кабинета.",
        ),
      );
    } finally {
      setIsLoggingOut(false);
    }
  }

  if (isLoading) {
    return (
      <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
        <div className="mx-auto max-w-6xl">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-10 text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-400">
              Панель организатора
            </p>
            <h1 className="mt-3 text-3xl font-bold">
              Загружаем ваши квизы...
            </h1>
            <p className="mt-3 text-slate-400">
              Подключаемся к аккаунту и получаем список квизов.
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (error && !organizer && quizzes.length === 0) {
    return (
      <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
        <div className="mx-auto max-w-4xl">
          <Link
            href="/organizer"
            className="text-sm text-sky-400 hover:text-sky-300"
          >
            ← Вернуться ко входу
          </Link>

          <div className="mt-8 rounded-2xl border border-red-500/30 bg-slate-900 p-8">
            <h1 className="text-2xl font-bold">
              Не удалось загрузить панель
            </h1>
            <p className="mt-3 text-red-300">{error}</p>

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
        <header className="flex flex-col gap-5 border-b border-slate-800 pb-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-400">
              Панель организатора
            </p>

            <h1 className="mt-2 text-3xl font-bold">
              Добро пожаловать
              {organizer?.name ? `, ${organizer.name}` : ""}
            </h1>

            <p className="mt-2 text-slate-400">
              Создавайте, запускайте и управляйте своими квизами.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/organizer/dashboard/create"
              className="rounded-xl bg-sky-500 px-6 py-3 text-center font-semibold transition hover:bg-sky-400"
            >
              Создать новый квиз
            </Link>

            <button
              type="button"
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="rounded-xl border border-slate-700 px-6 py-3 font-semibold transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoggingOut ? "Выходим..." : "Выйти"}
            </button>
          </div>
        </header>

        {(banner || pageBanner) && (
          <p className="mt-8 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-4 text-emerald-300">
            {banner || pageBanner}
          </p>
        )}

        {error && (
          <p className="mt-8 rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-red-300">
            {error}
          </p>
        )}

        <section className="mt-10 grid gap-5 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <p className="text-sm text-slate-400">Всего квизов</p>
            <p className="mt-2 text-4xl font-bold">{quizzes.length}</p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <p className="text-sm text-slate-400">Активные квизы</p>
            <p className="mt-2 text-4xl font-bold">{activeQuizzes}</p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <p className="text-sm text-slate-400">Участники</p>
            <p className="mt-2 text-4xl font-bold">
              {totalParticipants}
            </p>
          </div>
        </section>

        <section className="mt-10">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold">Мои квизы</h2>

            <Link
              href="/"
              className="text-sm text-sky-400 hover:text-sky-300"
            >
              На главную
            </Link>
          </div>

          {quizzes.length === 0 ? (
            <div className="mt-5 rounded-2xl border border-dashed border-slate-700 bg-slate-900/50 p-10 text-center">
              <h3 className="text-xl font-semibold">
                Квизов пока нет
              </h3>

              <p className="mt-2 text-slate-400">
                Создайте первый квиз и откройте комнату для
                участников.
              </p>

              <Link
                href="/organizer/dashboard/create"
                className="mt-6 inline-block rounded-xl bg-sky-500 px-6 py-3 font-semibold transition hover:bg-sky-400"
              >
                Создать квиз
              </Link>
            </div>
          ) : (
            <div className="mt-5 grid gap-5">
              {quizzes.map((quiz) => (
                <article
                  key={quiz.id}
                  className="rounded-2xl border border-slate-800 bg-slate-900 p-6"
                >
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm text-sky-400">
                        {quiz.category}
                      </p>

                      <h3 className="mt-1 text-2xl font-bold">
                        {quiz.title}
                      </h3>

                      <p className="mt-2 text-slate-400">
                        {quiz.description || "Описание отсутствует"}
                      </p>

                      <div className="mt-4 flex flex-wrap gap-4 text-sm text-slate-300">
                        <span>
                          Вопросов: {quiz.questions.length}
                        </span>

                        <span>
                          Время: {quiz.timePerQuestion} сек.
                        </span>

                        <span>
                          Код комнаты:{" "}
                          <strong className="text-white">
                            {quiz.roomCode ?? "—"}
                          </strong>
                        </span>

                        <span>
                          Статус:{" "}
                          <strong className="text-white">
                            {quiz.status === "draft" && "Черновик"}
                            {quiz.status === "active" && "Активен"}
                            {quiz.status === "finished" &&
                              "Завершён"}
                          </strong>
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-3 sm:min-w-44">
                      <Link
                        href={`/organizer/dashboard/quiz/${quiz.id}`}
                        className="rounded-xl bg-sky-500 px-5 py-3 text-center font-semibold transition hover:bg-sky-400"
                      >
                        Открыть квиз
                      </Link>

                      <button
                        type="button"
                        onClick={() => {
                          void handleDeleteQuiz(quiz.id);
                        }}
                        disabled={deletingQuizId === quiz.id}
                        className="rounded-xl border border-red-500/40 px-5 py-3 font-semibold text-red-400 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {deletingQuizId === quiz.id
                          ? "Удаляем..."
                          : "Удалить"}
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
