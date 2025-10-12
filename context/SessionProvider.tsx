/**
 * @fileoverview Session Context Provider
 * Manages user authentication state across the application using React Context.
 * Provides session data and loading states to all child components.
 *
 * @author Your Name
 * @version 1.0.0
 */

import React, { createContext, useState, useEffect, useContext } from "react";
import { supabase } from "../lib/supabase";
import { Session } from "@supabase/supabase-js";

/**
 * Session context interface
 * @interface SessionContextType
 */
interface SessionContextType {
  /** Current user session or null if not authenticated */
  session: Session | null;
  /** Loading state while session is being determined */
  loading: boolean;
}

/**
 * React context for session management
 * Provides session state to all components in the app
 */
const SessionContext = createContext<SessionContextType>({
  session: null,
  loading: true,
});

/**
 * Session provider component that wraps the app
 * Manages authentication state and provides it to child components
 *
 * @component
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Child components to wrap
 * @returns {JSX.Element} Provider component with session context
 *
 * @example
 * // Wrap your app with the session provider
 * <SessionProvider>
 *   <App />
 * </SessionProvider>
 */
export const SessionProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  /** Current authentication session */
  const [session, setSession] = useState<Session | null>(null);

  /** Loading state during session initialization */
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log("SessionProvider useEffect triggered");

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log("SessionProvider getSession result:", session);
      setSession(session);
      setLoading(false);
    });

    // Listen for auth state changes
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        console.log(
          "SessionProvider onAuthStateChange event:",
          _event,
          "session:",
          session
        );
        setSession(session);
        setLoading(false);
      }
    );

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  return (
    <SessionContext.Provider value={{ session, loading }}>
      {children}
    </SessionContext.Provider>
  );
};

/**
 * Custom hook to access session context
 * Provides easy access to session state and loading status
 *
 * @hook
 * @returns {SessionContextType} Session context with current session and loading state
 *
 * @example
 * // Use in any component to access session
 * const { session, loading } = useSession();
 *
 * if (loading) return <LoadingSpinner />;
 * if (!session) return <LoginScreen />;
 * return <AuthenticatedApp />;
 */
export const useSession = () => {
  return useContext(SessionContext);
};
