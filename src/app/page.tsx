import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-6 py-16">
        <div className="max-w-3xl">
          <p className="mb-4 text-sm font-semibold uppercase tracking-[0.25em] text-sky-400">
            VK Quiz
          </p>

          <h1 className="text-5xl font-bold leading-tight sm:text-6xl">
            Интерактивные квизы в реальном времени
          </h1>

          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
            Создавайте квизы, приглашайте участников по коду комнаты, проводите
            опросы в реальном времени и показывайте итоговый рейтинг.
          </p>

          <div className="mt-10 flex flex-col gap-4 sm:flex-row">
            <Link
              href="/organizer"
              className="rounded-xl bg-sky-500 px-6 py-3 text-center font-semibold text-white transition hover:bg-sky-400"
            >
              Я организатор
            </Link>

            <Link
              href="/join"
              className="rounded-xl border border-slate-700 px-6 py-3 text-center font-semibold text-white transition hover:bg-slate-900"
            >
              Присоединиться к квизу
            </Link>
          </div>
        </div>

        <div className="mt-16 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-xl font-semibold">Создание квизов</h2>
            <p className="mt-2 text-slate-400">
              Вопросы, варианты ответов, таймер и правила проведения.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-xl font-semibold">Код комнаты</h2>
            <p className="mt-2 text-slate-400">
              Участники подключаются к активному квизу по уникальному коду.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-xl font-semibold">Лидерборд</h2>
            <p className="mt-2 text-slate-400">
              Автоматический подсчёт баллов и отображение победителей.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
