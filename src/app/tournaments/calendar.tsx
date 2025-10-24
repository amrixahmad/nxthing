import { useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView } from "react-native";
import { Stack } from "expo-router";
import { supabase } from "@/lib/supabase";
import { Calendar, DateData } from "react-native-calendars";

type Tournament = {
  id: number;
  title: string;
  start_date: string | null;
  status: string | null;
  venue_name: string | null;
};

function fmtDate(d?: string | null) {
  if (!d) return "";
  try {
    const dt = new Date(d);
    return dt.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return d ?? "";
  }
}

function isoDay(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function TournamentsCalendar() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-based
  const [items, setItems] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const start = new Date(year, month, 1).toISOString();
        const end = new Date(year, month + 1, 1).toISOString();
        const { data, error } = await supabase
          .from("tournaments")
          .select("id,title,start_date,venue_name,status")
          .gte("start_date", start)
          .lt("start_date", end)
          .order("start_date", { ascending: true });
        if (error) throw error;
        setItems(data || []);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [year, month]);

  const dayMap = useMemo(() => {
    const map: Record<number, Tournament[]> = {};
    for (const t of items) {
      if (!t.start_date) continue;
      const d = new Date(t.start_date).getDate();
      if (!map[d]) map[d] = [];
      map[d].push(t);
    }
    return map;
  }, [items]);

  const currentIso = useMemo(() => isoDay(new Date(year, month, 1)), [year, month]);

  function onMonthChange(mo: DateData) {
    setYear(mo.year);
    setMonth(mo.month - 1);
  }

  const markedDates = useMemo(() => {
    const marks: Record<string, { marked: boolean }> = {};
    for (const t of items) {
      if (!t.start_date) continue;
      const d = isoDay(new Date(t.start_date));
      marks[d] = { marked: true };
    }
    return marks;
  }, [items]);

  return (
    <ScrollView className="flex-1 bg-gray-50">
      <Stack.Screen options={{ title: "Tournaments Calendar" }} />

      <View className="bg-white border-b border-gray-200">
        <View className="px-6 py-8">
          <Text className="text-2xl font-bold text-gray-900 mb-2">Tournaments Calendar</Text>
          <Text className="text-gray-600">Browse upcoming tournaments by month</Text>
        </View>
      </View>

      <View className="px-4 mt-6">
        <View className="bg-white rounded-xl border border-gray-100 p-2 mb-4">
          <Calendar
            current={currentIso}
            onMonthChange={onMonthChange}
            markedDates={markedDates}
            markingType="dot"
            theme={{
              todayTextColor: "#2563eb",
              selectedDayBackgroundColor: "#2563eb",
            }}
          />
        </View>

        <View className="bg-white rounded-xl border border-gray-100 p-4">
          <Text className="text-lg font-semibold text-gray-900 mb-3">This Month</Text>
          {loading ? (
            <Text className="text-gray-600">Loading…</Text>
          ) : items.length === 0 ? (
            <Text className="text-gray-600">No tournaments scheduled this month.</Text>
          ) : (
            <View className="space-y-3">
              {items.map((t) => (
                <View key={t.id} className="p-4 rounded-lg border border-gray-100 bg-white shadow-sm">
                  <Text className="text-base font-semibold text-gray-900 mb-1">{t.title}</Text>
                  <Text className="text-gray-600">{fmtDate(t.start_date)}{t.venue_name ? ` • ${t.venue_name}` : ""}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </View>
    </ScrollView>
  );
}
