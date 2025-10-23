import { useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import { Stack } from "expo-router";
import { supabase } from "@/lib/supabase";

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

function monthMatrix(y: number, m: number) {
  const first = new Date(y, m, 1);
  const firstWeekday = first.getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const cells: Array<number | null> = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const rows: Array<Array<number | null>> = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
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

  const monthLabel = useMemo(
    () => new Date(year, month, 1).toLocaleString(undefined, { month: "long", year: "numeric" }),
    [year, month]
  );

  function prevMonth() {
    setMonth((m) => {
      if (m === 0) {
        setYear((y) => y - 1);
        return 11;
      }
      return m - 1;
    });
  }

  function nextMonth() {
    setMonth((m) => {
      if (m === 11) {
        setYear((y) => y + 1);
        return 0;
      }
      return m + 1;
    });
  }

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
        <View className="bg-white rounded-xl border border-gray-100 p-4 mb-4">
          <View className="flex-row items-center justify-between mb-2">
            <TouchableOpacity className="px-3 py-2" onPress={prevMonth}>
              <Text className="text-lg">‹</Text>
            </TouchableOpacity>
            <Text className="text-lg font-semibold">{monthLabel}</Text>
            <TouchableOpacity className="px-3 py-2" onPress={nextMonth}>
              <Text className="text-lg">›</Text>
            </TouchableOpacity>
          </View>

          <View className="flex-row justify-between px-2 mb-2">
            {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((w) => (
              <Text key={w} className="w-10 text-center text-xs text-gray-500">{w}</Text>
            ))}
          </View>

          {monthMatrix(year, month).map((row, i) => (
            <View key={i} className="flex-row justify-between px-2 mb-1">
              {row.map((d, j) => (
                <View key={j} className="w-10 h-10 items-center justify-center">
                  {d ? (
                    <View className="items-center justify-center">
                      <Text className="text-sm text-gray-800">{d}</Text>
                      {dayMap[d] && dayMap[d].length > 0 && (
                        <View className="w-1.5 h-1.5 rounded-full bg-blue-600 mt-1" />
                      )}
                    </View>
                  ) : (
                    <Text className="text-transparent">0</Text>
                  )}
                </View>
              ))}
            </View>
          ))}
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
