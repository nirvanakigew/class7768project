import { usePrivy } from '@privy-io/react-auth';
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { setAuthToken } from '@/lib/queryClient';

export function useAuth() {
  const { toast } = useToast();
  const {
    ready,
    authenticated,
    user,
    login,
    logout: privyLogout,
    getAccessToken,
  } = usePrivy();
  const [, navigate] = useLocation();

  const [stableAuthenticated, setStableAuthenticated] = useState(authenticated);

  // Stabilize authentication state and set auth token for API requests
  useEffect(() => {
    if (ready) {
      // Only update stable state after Privy is ready
      setStableAuthenticated(authenticated);
      
      // If authenticated, get the access token and cache it for API requests
      if (authenticated && getAccessToken) {
        (async () => {
          try {
            const token = await getAccessToken();
            if (token) {
              setAuthToken(token);
              console.debug('✅ Privy auth token cached for API requests');
              console.debug('  Token length:', token.length, 'chars');

              // Check for stored referral code and report it to the backend
              const storedReferralCode = localStorage.getItem("referralCode");
              if (storedReferralCode) {
                try {
                  await apiRequest('POST', '/api/referrals/apply', { referralCode: storedReferralCode });
                  localStorage.removeItem("referralCode"); // Clear after successful application
                } catch (err) {
                  console.error('Failed to apply referral code:', err);
                }
              }
            } else {
              console.warn('⚠️ getAccessToken returned null/undefined');
            }
          } catch (err) {
            console.error('Failed to get Privy access token:', err);
            setAuthToken(null);
          }
        })();
      } else {
        // Clear token when logged out
        setAuthToken(null);
      }
    }
  }, [authenticated, ready, getAccessToken]);

  const logout = async () => {
    try {
      await privyLogout();
      // Force redirect to home page after logout
      window.location.replace('/');
      toast({
        title: "Logged out",
        description: "You have been logged out successfully",
      });
    } catch (error: any) {
      toast({
        title: "Logout failed",
        description: error.message || "Failed to logout",
        variant: "destructive",
      });
    }
  };

  return {
    user: stableAuthenticated ? user : null,
    isLoading: !ready,
    isAuthenticated: stableAuthenticated,
    login,
    logout,
    isLoggingOut: false,
  };
}