"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  createOrganizerQuiz,
  getOrganizerApiErrorMessage,
  isUnauthorizedError,
  type OrganizerQuestionType,
} from "@/lib/organizer-api";

type Question = {
  id: string;
  text: string;
  imageUrl: string;
  type: OrganizerQuestionType;
  options: string[];
  correctAnswers: number[];
};

function createEmptyQuestion(): Question {
  return {
    id: crypto.randomUUID(),
    text: "",
    imageUrl: "",
    type: "single",
    options: ["", ""],
    correctAnswers: [],
  };
}

export default function CreateQuizPage() {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Общие знания");
  const [timePerQuestion, setTimePerQuestion] = useState(30);
  const [description, setDescription] = useState("");
  const [questions, setQuestions] = useState<Question[]>([
    createEmptyQuestion(),
  ]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateQuestion(
    questionId: string,
    field: keyof Question,
    value: Question[keyof Question],
  ) {
    setQuestions((currentQuestions) =>
      currentQuestions.map((question) =>
        question.id === questionId
          ? { ...question, [field]: value }
          : question,
      ),
    );
  }

  function updateOption(
    questionId: string,
    optionIndex: number,
    value: string,
  ) {
    setQuestions((currentQuestions) =>
      currentQuestions.map((question) => {
        if (question.id !== questionId) {
          return question;
        }

        const updatedOptions = [...question.options];
        updatedOptions[optionIndex] = value;

        return {
          ...question,
          options: updatedOptions,
        };
      }),
    );
  }

  function addOption(questionId: string) {
    setQuestions((currentQuestions) =>
      currentQuestions.map((question) =>
        question.id === questionId
          ? {
              ...question,
              options: [...question.options, ""],
            }
          : question,
      ),
    );
  }

  function removeOption(questionId: string, optionIndex: number) {
    setQuestions((currentQuestions) =>
      currentQuestions.map((question) => {
        if (question.id !== questionId || question.options.length <= 2) {
          return question;
        }

        const updatedOptions = question.options.filter(
          (_, index) => index !== optionIndex,
        );

        const updatedCorrectAnswers = question.correctAnswers
          .filter((index) => index !== optionIndex)
          .map((index) => (index > optionIndex ? index - 1 : index));

        return {
          ...question,
          options: updatedOptions,
          correctAnswers: updatedCorrectAnswers,
        };
      }),
    );
  }

  function selectCorrectAnswer(
    questionId: string,
    optionIndex: number,
    type: OrganizerQuestionType,
  ) {
    setQuestions((currentQuestions) =>
      currentQuestions.map((question) => {
        if (question.id !== questionId) {
          return question;
        }

        if (type === "single") {
          return {
            ...question,
            correctAnswers: [optionIndex],
          };
        }

        const alreadySelected =
          question.correctAnswers.includes(optionIndex);

        return {
          ...question,
          correctAnswers: alreadySelected
            ? question.correctAnswers.filter(
                (index) => index !== optionIndex,
              )
            : [...question.correctAnswers, optionIndex],
        };
      }),
    );
  }

  function addQuestion() {
    setQuestions((currentQuestions) => [
      ...currentQuestions,
      createEmptyQuestion(),
    ]);
  }

  function removeQuestion(questionId: string) {
    if (questions.length === 1) {
      return;
    }

    setQuestions((currentQuestions) =>
      currentQuestions.filter((question) => question.id !== questionId),
    );
  }

  function validateQuiz() {
    if (!title.trim()) {
      return "Введите название квиза.";
    }

    for (let index = 0; index < questions.length; index += 1) {
      const question = questions[index];

      if (!question.text.trim()) {
        return `Введите текст вопроса №${index + 1}.`;
      }

      if (question.options.some((option) => !option.trim())) {
        return `Заполните все варианты ответа в вопросе №${index + 1}.`;
      }

      if (question.correctAnswers.length === 0) {
        return `Выберите правильный ответ в вопросе №${index + 1}.`;
      }
    }

    return "";
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const validationError = validateQuiz();

    if (validationError) {
      setError(validationError);
      setSuccess("");
      return;
    }

    setIsSubmitting(true);
    setError("");
    setSuccess("");

    try {
      await createOrganizerQuiz({
        title: title.trim(),
        category,
        description: description.trim() || null,
        timePerQuestion,
        questions: questions.map((question) => ({
          text: question.text.trim(),
          imageUrl: question.imageUrl.trim(),
          type: question.type,
          options: question.options.map((option) => option.trim()),
          correctAnswers: question.correctAnswers,
        })),
      });

      setSuccess("Квиз сохранён. Переходим в панель...");
      router.push("/organizer/dashboard?created=1");
      router.refresh();
    } catch (submitError) {
      if (isUnauthorizedError(submitError)) {
        router.replace("/organizer?reason=auth");
        router.refresh();
        return;
      }

      setError(
        getOrganizerApiErrorMessage(
          submitError,
          "Не удалось сохранить квиз.",
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/organizer/dashboard"
          className="text-sm text-sky-400 hover:text-sky-300"
        >
          ← Вернуться в панель
        </Link>

        <div className="mt-6">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-400">
            Новый квиз
          </p>

          <h1 className="mt-2 text-4xl font-bold">
            Создание квиза
          </h1>

          <p className="mt-3 text-slate-400">
            Добавьте название, настройки, вопросы и правильные
            ответы.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-10 space-y-8">
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-2xl font-bold">
              Основная информация
            </h2>

            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label
                  htmlFor="title"
                  className="mb-2 block text-sm font-medium text-slate-300"
                >
                  Название квиза
                </label>

                <input
                  id="title"
                  type="text"
                  value={title}
                  onChange={(event) => {
                    setTitle(event.target.value);
                    setError("");
                  }}
                  placeholder="Например: Основы HTML"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label
                  htmlFor="category"
                  className="mb-2 block text-sm font-medium text-slate-300"
                >
                  Категория
                </label>

                <select
                  id="category"
                  value={category}
                  onChange={(event) => {
                    setCategory(event.target.value);
                    setError("");
                  }}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-sky-500"
                >
                  <option>Общие знания</option>
                  <option>Программирование</option>
                  <option>Наука</option>
                  <option>История</option>
                  <option>Кино</option>
                  <option>Спорт</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="time"
                  className="mb-2 block text-sm font-medium text-slate-300"
                >
                  Время на вопрос
                </label>

                <select
                  id="time"
                  value={timePerQuestion}
                  onChange={(event) => {
                    setTimePerQuestion(Number(event.target.value));
                    setError("");
                  }}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-sky-500"
                >
                  <option value={15}>15 секунд</option>
                  <option value={30}>30 секунд</option>
                  <option value={45}>45 секунд</option>
                  <option value={60}>60 секунд</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label
                  htmlFor="description"
                  className="mb-2 block text-sm font-medium text-slate-300"
                >
                  Описание
                </label>

                <textarea
                  id="description"
                  value={description}
                  onChange={(event) => {
                    setDescription(event.target.value);
                    setError("");
                  }}
                  placeholder="Краткое описание квиза"
                  rows={3}
                  className="w-full resize-none rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-sky-500"
                />
              </div>
            </div>
          </section>

          <section className="space-y-6">
            {questions.map((question, questionIndex) => (
              <article
                key={question.id}
                className="rounded-2xl border border-slate-800 bg-slate-900 p-6"
              >
                <div className="flex items-center justify-between gap-4">
                  <h2 className="text-2xl font-bold">
                    Вопрос {questionIndex + 1}
                  </h2>

                  <button
                    type="button"
                    onClick={() => removeQuestion(question.id)}
                    disabled={questions.length === 1}
                    className="text-sm text-red-400 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Удалить вопрос
                  </button>
                </div>

                <div className="mt-6 space-y-5">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-300">
                      Текст вопроса
                    </label>

                    <input
                      type="text"
                      value={question.text}
                      onChange={(event) =>
                        updateQuestion(
                          question.id,
                          "text",
                          event.target.value,
                        )
                      }
                      placeholder="Введите вопрос"
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-sky-500"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-300">
                      Ссылка на изображение — необязательно
                    </label>

                    <input
                      type="url"
                      value={question.imageUrl}
                      onChange={(event) =>
                        updateQuestion(
                          question.id,
                          "imageUrl",
                          event.target.value,
                        )
                      }
                      placeholder="https://example.com/image.jpg"
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-sky-500"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-300">
                      Тип ответа
                    </label>

                    <select
                      value={question.type}
                      onChange={(event) => {
                        const newType =
                          event.target.value as OrganizerQuestionType;

                        updateQuestion(question.id, "type", newType);
                        updateQuestion(
                          question.id,
                          "correctAnswers",
                          [],
                        );
                      }}
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-sky-500"
                    >
                      <option value="single">
                        Один правильный ответ
                      </option>
                      <option value="multiple">
                        Несколько правильных ответов
                      </option>
                    </select>
                  </div>

                  <div>
                    <p className="mb-3 text-sm font-medium text-slate-300">
                      Варианты ответа
                    </p>

                    <div className="space-y-3">
                      {question.options.map((option, optionIndex) => (
                        <div
                          key={`${question.id}-${optionIndex}`}
                          className="flex items-center gap-3"
                        >
                          <input
                            type={
                              question.type === "single"
                                ? "radio"
                                : "checkbox"
                            }
                            name={`correct-${question.id}`}
                            checked={question.correctAnswers.includes(
                              optionIndex,
                            )}
                            onChange={() =>
                              selectCorrectAnswer(
                                question.id,
                                optionIndex,
                                question.type,
                              )
                            }
                            className="h-5 w-5 accent-sky-500"
                          />

                          <input
                            type="text"
                            value={option}
                            onChange={(event) =>
                              updateOption(
                                question.id,
                                optionIndex,
                                event.target.value,
                              )
                            }
                            placeholder={`Вариант ${optionIndex + 1}`}
                            className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-sky-500"
                          />

                          <button
                            type="button"
                            onClick={() =>
                              removeOption(question.id, optionIndex)
                            }
                            disabled={question.options.length <= 2}
                            className="rounded-lg px-3 py-2 text-red-400 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-30"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => addOption(question.id)}
                      className="mt-4 text-sm font-semibold text-sky-400 hover:text-sky-300"
                    >
                      + Добавить вариант
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </section>

          <button
            type="button"
            onClick={addQuestion}
            className="w-full rounded-2xl border border-dashed border-slate-700 px-6 py-5 font-semibold text-sky-400 transition hover:border-sky-500 hover:bg-sky-500/5"
          >
            + Добавить вопрос
          </button>

          {success && (
            <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-4 text-emerald-300">
              {success}
            </p>
          )}

          {error && (
            <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-red-300">
              {error}
            </p>
          )}

          <div className="flex flex-col gap-4 sm:flex-row sm:justify-end">
            <Link
              href="/organizer/dashboard"
              className="rounded-xl border border-slate-700 px-6 py-3 text-center font-semibold hover:bg-slate-900"
            >
              Отмена
            </Link>

            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-xl bg-sky-500 px-8 py-3 font-semibold transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "Сохраняем..." : "Сохранить квиз"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
