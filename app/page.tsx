'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Check, ExternalLink, Star, ChevronLeft, ChevronRight, Utensils } from 'lucide-react';

export default function Home() {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [meals, setMeals] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMeals();
  }, [selectedDate]);

  async function fetchMeals() {
    setLoading(true);
    const { data, error } = await supabase
      .from('daily_plan')
      .select('*')
      .eq('date', selectedDate)
      .order('created_at', { ascending: true });

    if (!error) {
      setMeals(data || []);
    }
    setLoading(false);
  }

  async function toggleComplete(mealId, currentStatus) {
    const updatedStatus = !currentStatus;
    setMeals(meals.map(m => m.id === mealId ? { ...m, is_completed: updatedStatus } : m));

    await supabase
      .from('daily_plan')
      .update({ is_completed: updatedStatus })
      .eq('id', mealId);
  }

  const changeDate = (days) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + days);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-800 pb-20 max-w-md mx-auto relative font-sans">
      {/* Header Aesthetic */}
      <header className="bg-gradient-to-r from-teal-500 to-emerald-500 text-white pt-10 pb-6 px-6 rounded-b-3xl shadow-md">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold tracking-tight">Dieta de Alba ✨</h1>
          <div className="w-9 h-9 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-sm font-bold">
            A
          </div>
        </div>

        {/* Selector de Fecha */}
        <div className="flex items-center justify-between bg-white/10 backdrop-blur-md rounded-2xl p-2 border border-white/20">
          <button onClick={() => changeDate(-1)} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
            <ChevronLeft size={20} />
          </button>
          <span className="font-semibold text-sm capitalize">
            {new Date(selectedDate).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}
          </span>
          <button onClick={() => changeDate(1)} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
            <ChevronRight size={20} />
          </button>
        </div>
      </header>

      {/* Lista de Comidas */}
      <section className="px-5 mt-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-700">Plan del día</h2>
          <span className="text-xs text-slate-400 font-medium">
            {meals.filter(m => m.is_completed).length} / {meals.length} completados
          </span>
        </div>

        {loading ? (
          <div className="text-center py-10 text-slate-400 text-sm">Cargando comidas...</div>
        ) : meals.length === 0 ? (
          <div className="bg-white p-8 rounded-2xl text-center shadow-sm border border-slate-100">
            <Utensils className="mx-auto text-slate-300 mb-2" size={32} />
            <p className="text-slate-500 text-sm font-medium">No hay plan cargado para este día.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {meals.map((meal) => (
              <div 
                key={meal.id} 
                className={`bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between transition-all ${
                  meal.is_completed ? 'opacity-75 bg-slate-50/50' : ''
                }`}
              >
                <div className="flex-1 pr-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-teal-700 bg-teal-50 px-2.5 py-0.5 rounded-full">
                      {meal.meal_type}
                    </span>
                    {meal.is_free_meal && (
                      <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full">
                        {meal.free_meal_label || 'Libre'}
                      </span>
                    )}
                  </div>

                  <h3 className={`font-medium text-slate-800 text-sm ${meal.is_completed ? 'line-through text-slate-400' : ''}`}>
                    {meal.title}
                  </h3>

                  {meal.recipe_url && (
                    <div className="flex items-center gap-3 mt-2">
                      <a
                        href={meal.recipe_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-teal-600 font-medium hover:underline"
                      >
                        <span>Ver Reel</span>
                        <ExternalLink size={12} />
                      </a>
                      <div className="flex items-center text-amber-400">
                        {[...Array(5)].map((_, i) => (
                          <Star
                            key={i}
                            size={10}
                            fill={i < (meal.rating || 5) ? "currentColor" : "none"}
                            className={i < (meal.rating || 5) ? "" : "text-slate-200"}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => toggleComplete(meal.id, meal.is_completed)}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                    meal.is_completed
                      ? 'bg-teal-500 text-white shadow-md shadow-teal-500/20'
                      : 'bg-slate-100 text-slate-300 hover:bg-slate-200'
                  }`}
                >
                  <Check size={20} strokeWidth={3} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}