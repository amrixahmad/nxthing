import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { View, Text, Animated, Easing, Platform } from "react-native";

export type ToastType = "success" | "error" | "info";

export type ToastOptions = {
  type?: ToastType;
  message: string;
  durationMs?: number;
};

type ToastContextValue = {
  show: (opts: ToastOptions | string) => void;
  hide: () => void;
};

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState("");
  const [type, setType] = useState<ToastType>("info");
  const hideTimer = useRef<number | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;

  const hide = useCallback(() => {
    if (!visible) return;
    Animated.timing(opacity, { toValue: 0, duration: 150, useNativeDriver: true, easing: Easing.out(Easing.quad) }).start(() => {
      setVisible(false);
      setMessage("");
    });
  }, [opacity, visible]);

  const show = useCallback(
    (opts: ToastOptions | string) => {
      const o: ToastOptions = typeof opts === "string" ? { message: opts } : opts || { message: "" };
      const d = o.durationMs ?? 2500;
      setType(o.type ?? "info");
      setMessage(o.message);
      setVisible(true);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true, easing: Easing.out(Easing.quad) }).start();
      hideTimer.current = setTimeout(hide, d) as unknown as number;
    },
    [hide, opacity]
  );

  const value = useMemo(() => ({ show, hide }), [show, hide]);

  return (
    <ToastContext.Provider value={value}>
      <View className="flex-1">
        {children}
        {visible ? (
          <Animated.View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              // Place near top, below any native header area
              top: Platform.OS === "web" ? 12 : 12,
              opacity,
              zIndex: 50,
            }}
            className="px-4"
          >
            <View
              className={
                type === "success"
                  ? "mx-auto max-w-2xl w-full rounded-lg border border-green-200 bg-green-50 p-4 shadow"
                  : type === "error"
                  ? "mx-auto max-w-2xl w-full rounded-lg border border-red-200 bg-red-50 p-4 shadow"
                  : "mx-auto max-w-2xl w-full rounded-lg border border-blue-200 bg-blue-50 p-4 shadow"
              }
            >
              <Text className={type === "success" ? "text-green-800" : type === "error" ? "text-red-800" : "text-blue-800"}>{message}</Text>
            </View>
          </Animated.View>
        ) : null}
      </View>
    </ToastContext.Provider>
  );
}
