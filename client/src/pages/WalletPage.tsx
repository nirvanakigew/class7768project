import { useState, useEffect } from "react";
import { MobileNavigation } from "@/components/MobileNavigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { usePrivy } from "@privy-io/react-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { formatDistanceToNow, formatDistanceToNowStrict } from "date-fns";
// Token-friendly formatting helper (no fiat symbols)
import { PlayfulLoading } from "@/components/ui/playful-loading";
import { getBalances } from "@/lib/contractInteractions";
import {
  ShoppingCart,
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  TrendingUp,
  Receipt,
  Gift,
  Calendar,
  Trophy,
  Plus,
  ExternalLink,
  Zap,
  Send,
  Check,
} from "lucide-react";
import { useLocation } from "wouter";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';

export default function WalletPage() {
  const { user } = useAuth();
  const { user: privyUser, fundWallet, getEthereumProvider } = usePrivy();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [isClaimModalOpen, setIsClaimModalOpen] = useState(false);
  const [claimableChallenges, setClaimableChallenges] = useState<any[]>([]);
  const [claiming, setClaiming] = useState<boolean>(false);
  const [chartDays, setChartDays] = useState<7 | 30>(7);

  // Helper function to calculate if user can claim points this week
  const canClaimPointsThisWeek = (lastClaimedAt: string | null): boolean => {
    if (!lastClaimedAt) return true; // Never claimed, can claim now
    
    const lastClaim = new Date(lastClaimedAt);
    const now = new Date();
    
    // Get current week's Sunday
    const currentSunday = new Date(now);
    currentSunday.setDate(now.getDate() - now.getDay()); // Sunday of current week
    currentSunday.setHours(0, 0, 0, 0);
    
    // Check if last claim was in a previous week
    return lastClaim < currentSunday;
  };

  // Helper function to get next claim time
  const getNextClaimTime = (lastClaimedAt: string | null): Date => {
    const now = new Date();
    
    if (!lastClaimedAt) {
      // Never claimed, can claim on next Sunday
      const nextSunday = new Date(now);
      nextSunday.setDate(now.getDate() + (7 - now.getDay())); // Next Sunday
      nextSunday.setHours(0, 0, 0, 0);
      return nextSunday;
    }
    
    const lastClaim = new Date(lastClaimedAt);
    const nextClaimSunday = new Date(lastClaim);
    nextClaimSunday.setDate(lastClaim.getDate() + 7); // 7 days after last claim
    return nextClaimSunday;
  };

  // Fetch ETH price in USD
  const { data: ethPrice } = useQuery({
    queryKey: ['eth-price'],
    queryFn: async () => {
      try {
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
        const data = await response.json();
        return data.ethereum?.usd || 0;
      } catch (err) {
        console.warn('Failed to fetch ETH price:', err);
        return 0;
      }
    },
    staleTime: 60000, // 1 minute
    retry: false,
  });

  // Fetch earnings history for chart
  const { data: earningsHistory = [] } = useQuery({
    queryKey: ['earnings-history', user?.id, chartDays],
    enabled: !!user?.id,
    queryFn: async () => {
      try {
        console.log('📊 Fetching earnings history for:', chartDays, 'days');
        const data = await apiRequest('GET', `/api/payouts/earnings-history?days=${chartDays}`);
        console.log('✅ Earnings history received:', data);
        return data;
      } catch (err) {
        console.warn('⚠️ Failed to fetch earnings history:', err);
        return [];
      }
    },
    staleTime: 300000, // 5 minutes
    retry: false,
  });

  // Auto-sync Privy wallet to database when connected
  useEffect(() => {
    if (!user?.id || !privyUser?.wallet?.address) {
      return; // No user or wallet connected
    }

    const syncWallet = async () => {
      try {
        const res = await fetch("/api/points/connect-wallet", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            walletAddress: privyUser.wallet.address,
            walletType: "privy",
          }),
        });

        if (!res.ok) {
          const error = await res.json();
          // 409 Conflict = already connected, that's fine
          if (res.status !== 409) {
            console.warn("Failed to sync wallet:", error);
          }
        } else {
          console.log("✅ Wallet synced to database");
          // Refetch wallets list after sync
          queryClient.invalidateQueries({ queryKey: ["/api/points/wallets", user.id] });
        }
      } catch (err) {
        console.error("Error syncing wallet:", err);
      }
    };

    syncWallet();
  }, [user?.id, privyUser?.wallet?.address, queryClient]);

  const { data: balance = { balance: 0 } } = useQuery({
    queryKey: ["/api/wallet/balance"],
    retry: false,
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
      }
    },
  });

  

  

  const { data: pointsData } = useQuery({
    queryKey: ["/api/points/balance", user?.id],
    enabled: !!user?.id,
    retry: false,
    queryFn: async () => {
      const res = await fetch(`/api/points/balance/${user.id}`);
      if (!res.ok) throw new Error('Failed to fetch points balance');
      return res.json();
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
      }
    },
  });

  const { data: walletsData } = useQuery({
    queryKey: ["/api/points/wallets", user?.id],
    enabled: !!user?.id,
    retry: false,
    queryFn: async () => {
      const res = await fetch(`/api/points/wallets`);
      if (!res.ok) throw new Error('Failed to fetch wallets');
      return res.json();
    },
  });

  const setPrimaryMutation = useMutation({
    mutationFn: async (walletId: number) => {
      return await apiRequest("POST", `/api/points/set-primary-wallet/${walletId}`);
    },
    onSuccess: () => {
      toast({ title: "Primary wallet updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/points/wallets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallet/balance"] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to set primary wallet", description: err.message, variant: "destructive" });
    },
  });

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ["/api/user/transactions"],
    retry: false,
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
      }
    },
  });

  // Normalize transactions to an array shape for rendering
  const txArray = Array.isArray(transactions)
    ? transactions
    : (transactions && (transactions.transactions || transactions.items)) || [];

  if (!user) return null;

  const currentBalance =
    typeof balance === "object" ? balance.balance || 0 : balance || 0;

  // Prefer primary connected wallet crypto (USDC) display when available
  // If the server hasn't recorded the Privy wallet yet, show Privy as a fallback
  const serverPrimary = walletsData?.wallets?.find((w: any) => w.isPrimary) || null;
  
  // Check for external wallet connection (MetaMask, etc.)
  const externalWallet = (window as any).ethereum?.selectedAddress 
    ? {
        id: 'external-wallet',
        address: (window as any).ethereum.selectedAddress,
        type: 'external',
        isPrimary: !serverPrimary, // Use external as primary if no server primary
        usdcBalance: null,
        usdtBalance: null,
        nativeBalance: null,
        pointsBalance: null,
      }
    : null;
  
  const privyFallback = privyUser?.wallet?.address && !externalWallet
    ? {
        id: 'privy-fallback',
        address: privyUser.wallet.address,
        type: 'privy',
        isPrimary: !serverPrimary && !externalWallet,
        usdcBalance: null,
        usdtBalance: null,
        nativeBalance: null,
        pointsBalance: null,
      }
    : null;

  const primaryWallet = serverPrimary || externalWallet || privyFallback || null;

  const formatTokenAmount = (value: any, decimals = 0, maxDecimals = 4) => {
    if (value === null || value === undefined) return '0';
    const n = typeof value === 'string' ? Number(value) : value;
    if (!isFinite(n)) return '0';
    const scaled = decimals > 0 ? n / Math.pow(10, decimals) : n;
    return scaled >= 1 ? scaled.toLocaleString(undefined, { maximumFractionDigits: maxDecimals }) : scaled.toPrecision(4).replace(/\.0+$/,'');
  };
  // Return token strings for a wallet (include zero values)
  const getTokenStrings = (w: any) => {
    const items: string[] = [];
    const eth = formatTokenAmount(Number(w?.nativeBalance || 0), 18, 6) + ' ETH';
    const usdc = formatTokenAmount(Number(w?.usdcBalance || 0), 6, 6) + ' USDC';
    const usdt = formatTokenAmount(Number(w?.usdtBalance || 0), 6, 6) + ' USDT';
    const pts = formatTokenAmount(Number(w?.pointsBalance || 0), 18, 4) + ' BPTS';
    items.push(eth, usdc, usdt, pts);
    return items;
  };

  // Choose a single primary token to show: prefer native, then USDC, then USDT, then BPTS
  // Fetch on-chain balances for the primary wallet (Privy or other provider)
  const { data: onchainBalances } = useQuery({
    queryKey: ["/onchain/balances", primaryWallet?.address],
    enabled: !!primaryWallet?.address,
    queryFn: async () => {
      let providerSource = null;
      let providerType = 'unknown';
      
      // Prefer external wallet provider
      if ((window as any).ethereum) {
        providerSource = (window as any).ethereum;
        providerType = (window as any).ethereum.isMetaMask ? 'metamask' : 'injected';
      }
      // Fallback to Privy provider
      else if (getEthereumProvider) {
        try {
          providerSource = await getEthereumProvider();
          providerType = 'privy';
        } catch (err) {
          console.warn('Failed to get Privy provider:', err);
        }
      }
      
      if (!providerSource) {
        return {};
      }
      
      const balances = await getBalances(providerSource, primaryWallet.address);
      // Override provider name with our detected type
      balances.providerName = providerType;
      
      return balances;
    },
    refetchInterval: 15000,
    retry: false,
  });

  const mergedPrimary = { ...(primaryWallet || {}), ...(onchainBalances || {}) };

  const primaryTokenDisplay = mergedPrimary
    ? (() => {
        const order = [
          { key: 'nativeBalance', label: 'ETH', decimals: 18, max: 6 },
          { key: 'usdcBalance', label: 'USDC', decimals: 6, max: 6 },
          { key: 'usdtBalance', label: 'USDT', decimals: 6, max: 6 },
          { key: 'pointsBalance', label: 'BPTS', decimals: 18, max: 4 },
        ];
        for (const t of order) {
          const v = mergedPrimary[t.key];
          if (v !== undefined && v !== null) return formatTokenAmount(Number(v), t.decimals, t.max) + ' ' + t.label;
        }
        // fallback to ETH with 0 balance if no wallet data
        return '0 ETH';
      })()
    : 'No connected wallet';

  const currentPointsDisplay = pointsData?.balanceFormatted ?? '0';
  const currentPointsShort = (() => {
    const n = parseFloat(String(pointsData?.balanceFormatted ?? '0')) || 0;
    return n > 999 ? '1K+' : Math.round(n).toString();
  })();

  // Calculate USD value of wallet balance
  const getUsdValue = () => {
    if (!ethPrice || !mergedPrimary?.nativeBalance) return null;
    try {
      const ethAmount = Number(mergedPrimary.nativeBalance) / Math.pow(10, 18);
      const usdValue = ethAmount * ethPrice;
      return usdValue > 0 ? `$${usdValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : null;
    } catch {
      return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 theme-transition pb-[50px]">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
        {/* Header Section */}
        <div className="mb-3 sm:mb-6"></div>

        {/* Balance Cards Grid (Wallet / Bantah Points) */}
        <div className="grid grid-cols-3 md:grid-cols-2 xl:grid-cols-3 gap-2 sm:gap-3 mb-3 sm:mb-5">
          {/* Wallet Balance Card */}
          <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl sm:rounded-2xl p-2 sm:p-4 border border-emerald-100 dark:border-emerald-800/30">
            <div className="flex items-center justify-between mb-1 sm:mb-2">
              <div className="w-6 sm:w-8 h-6 sm:h-8 rounded-lg sm:rounded-xl bg-emerald-200 dark:bg-emerald-700 flex items-center justify-center">
                <Wallet className="w-3 sm:w-4 h-3 sm:h-4 text-emerald-700 dark:text-emerald-300" />
              </div>
            </div>
            <div className="space-y-0.5">
              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Wallet</p>
              <h3 className="text-xs sm:text-xl font-bold text-emerald-900 dark:text-emerald-100">
                {primaryTokenDisplay}
                {getUsdValue() && <span className="text-xs sm:text-sm text-emerald-700 dark:text-emerald-300"> ({getUsdValue()})</span>}
              </h3>
            </div>
          </div>

          {/* Earnings Card */}
          <div className="bg-sky-50 dark:bg-sky-900/20 rounded-xl sm:rounded-2xl p-2 sm:p-4 border border-sky-100 dark:border-sky-800/30">
            <div className="flex items-center justify-between mb-1 sm:mb-2">
              <div className="w-6 sm:w-8 h-6 sm:h-8 rounded-lg sm:rounded-xl bg-sky-200 dark:bg-sky-700 flex items-center justify-center">
                <Zap className="w-3 sm:w-4 h-3 sm:h-4 text-sky-700 dark:text-sky-300" />
              </div>
            </div>
            <div className="space-y-0.5">
              <p className="text-xs text-sky-600 dark:text-sky-400 font-medium">Earnings</p>
              <h3 className="text-sm sm:text-xl font-bold text-sky-900 dark:text-sky-100">{formatTokenAmount(Number(currentBalance || 0), 0, 4)}</h3>
            </div>
          </div>

          {/* Bantah Points Card */}
          <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl sm:rounded-2xl p-2 sm:p-4 border border-amber-100 dark:border-amber-800/30">
            <div className="flex items-center justify-between mb-1 sm:mb-2">
              <div className="w-6 sm:w-8 h-6 sm:h-8 rounded-lg sm:rounded-xl bg-amber-200 dark:bg-amber-700 flex items-center justify-center">
                <Zap className="w-3 sm:w-4 h-3 sm:h-4 text-amber-700 dark:text-amber-300" />
              </div>
              <div className="w-4 sm:w-5 h-4 sm:h-5 rounded-full bg-amber-200 dark:bg-amber-700 flex items-center justify-center">
                <span className="text-xs font-bold text-amber-700 dark:text-amber-300">{currentPointsShort > '999' ? '1K+' : currentPointsShort}</span>
              </div>
            </div>
            <div className="space-y-0.5">
              <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">Bantah Points</p>
              <h3 className="text-sm sm:text-xl font-bold text-amber-900 dark:text-amber-100">{currentPointsDisplay}</h3>
              {/* Weekly Claiming Status */}
              <div className="mt-2 pt-2 border-t border-amber-200 dark:border-amber-800/50">
                {canClaimPointsThisWeek(pointsData?.lastClaimedAt) ? (
                  <div className="flex items-center gap-1">
                    <Check className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                    <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">Ready to claim</p>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-amber-500 dark:text-amber-500" />
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      Next claim: {formatDistanceToNowStrict(getNextClaimTime(pointsData?.lastClaimedAt), { addSuffix: true })}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Performance/Earnings Chart */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-3 sm:p-4 border border-slate-200 dark:border-slate-700 mt-6 sm:mt-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">Portfolio Performance</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Cumulative earnings</p>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={() => setChartDays(7)}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${
                  chartDays === 7 
                    ? 'bg-emerald-500 text-white' 
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                }`}
              >
                7d
              </button>
              <button 
                onClick={() => setChartDays(30)}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${
                  chartDays === 30 
                    ? 'bg-emerald-500 text-white' 
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                }`}
              >
                30d
              </button>
            </div>
          </div>

          {earningsHistory && earningsHistory.length > 0 ? (
            <ResponsiveContainer width="100%" height={140}>
              <AreaChart data={earningsHistory} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <defs>
                  <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.01}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="0" stroke="transparent" vertical={false} />
                <XAxis 
                  dataKey="date" 
                  stroke="#94a3b8"
                  style={{ fontSize: '11px' }}
                  tick={false}
                  axisLine={false}
                />
                <YAxis 
                  stroke="#94a3b8"
                  style={{ fontSize: '11px' }}
                  tickFormatter={(value) => `$${value}`}
                  width={40}
                  axisLine={false}
                />
                <Tooltip 
                  formatter={(value: any) => [`$${Number(value).toFixed(2)}`, 'Earnings']}
                  labelFormatter={(label) => `Date: ${label}`}
                  contentStyle={{ 
                    backgroundColor: '#1f2937', 
                    border: '1px solid #374151', 
                    borderRadius: '8px', 
                    fontSize: '12px',
                    color: '#fff'
                  }}
                  cursor={{ stroke: '#10b981', strokeWidth: 2 }}
                />
                <Area 
                  type="monotone" 
                  dataKey="amount" 
                  stroke="#10b981" 
                  strokeWidth={2.5}
                  fill="url(#colorAmount)"
                  isAnimationActive={true}
                  animationDuration={800}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-24 flex items-center justify-center text-xs text-slate-500">
              <p>No earnings data yet. Start earning to see your performance!</p>
            </div>
          )}
        </div>

        {/* Deposit & Claim Actions */}
        <div className="grid grid-cols-2 gap-2 sm:gap-3 mt-6 sm:mt-10">
          <Button
            onClick={() => setIsDepositModalOpen(true)}
            className="bg-green-600 hover:bg-green-700 text-white rounded-xl h-12 font-semibold flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Deposit
          </Button>
          <Button
            onClick={async () => {
              if (!user?.id) {
                toast({ title: "Not signed in", description: "Please sign in to claim payouts", variant: "destructive" });
                return;
              }

              try {
                // Fetch claimable payouts from server
                const res = await fetch(`/api/payouts/user/${user.id}`);
                if (!res.ok) throw new Error('Failed to fetch claimable payouts');
                const data = await res.json();
                setClaimableChallenges(data.challenges || []);
                setIsClaimModalOpen(true);
              } catch (err: any) {
                console.error('Failed to load claimable payouts', err);
                toast({ title: 'Error', description: err.message || 'Failed to fetch payouts', variant: 'destructive' });
              }
            }}
            className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl h-12 font-semibold flex items-center justify-center gap-2"
          >
            <Check className="w-4 h-4" />
            Claim Earnings
          </Button>
        </div>

        {/* Recent Transactions */}
        <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 border border-slate-200 dark:border-slate-700 mt-8 sm:mt-12">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              Recent Activity
            </h3>
            <Button variant="ghost" size="sm" className="p-1">
              <Receipt className="w-4 h-4" />
            </Button>
          </div>

          {isLoading ? (
            <PlayfulLoading
              type="wallet"
              title="Loading Transactions"
              description="Getting your transaction history..."
              className="py-8"
            />
          ) : txArray.length === 0 ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-slate-100 dark:bg-slate-700 rounded-3xl flex items-center justify-center mx-auto mb-4">
                <Receipt className="w-8 h-8 text-slate-400" />
              </div>
              <h4 className="text-slate-900 dark:text-white font-medium mb-1">
                No transactions yet
              </h4>
              <p className="text-slate-500 text-sm">
                Your transaction history will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {txArray.slice(0, 5).map((transaction: any) => (
                <div
                  key={transaction.id}
                  className="flex items-center justify-between p-3 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-2xl transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
                        transaction.type === "deposit" ||
                        transaction.type === "signup_bonus" ||
                        transaction.type === "daily_signin" ||
                        transaction.type === "Gift received"
                          ? "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400"
                          : transaction.type === "coin_purchase" &&
                              parseFloat(transaction.amount) > 0
                            ? "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400"
                            : "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
                      }`}
                    >
                      {transaction.type === "signup_bonus" && (
                        <Trophy className="w-5 h-5" />
                      )}
                      {transaction.type === "daily_signin" && (
                        <Calendar className="w-5 h-5" />
                      )}
                      {transaction.type === "coin_purchase" && (
                        <ShoppingCart className="w-5 h-5" />
                      )}
                      {transaction.type === "challenge_escrow" && (
                        <ArrowUpRight className="w-5 h-5" />
                      )}
                      {transaction.type === "Gifted" && (
                        <Gift className="w-5 h-5" />
                      )}
                      {transaction.type === "Gift received" && (
                        <Gift className="w-5 h-5" />
                      )}
                      {![
                        "signup_bonus",
                        "daily_signin",
                        "coin_purchase",
                        "challenge_escrow",
                        "Gifted",
                        "Gift received",
                      ].includes(transaction.type) && (
                        <Wallet className="w-5 h-5" />
                      )}
                    </div>
                    <div>
                      <h4 className="font-medium text-slate-900 dark:text-white text-sm">
                        {transaction.type === "signup_bonus" && "Welcome Bonus"}
                        {transaction.type === "daily_signin" && "Daily Sign-in"}
                        {transaction.type === "coin_purchase" &&
                          "Coin Purchase"}
                        {transaction.type === "challenge_escrow" &&
                          "Challenge Entry"}
                        {transaction.type === "Gifted" && "Gifted"}
                        {transaction.type === "Gift received" && "Gift received"}
                        {![
                          "signup_bonus",
                          "daily_signin",
                          "coin_purchase",
                          "challenge_escrow",
                          "Gifted",
                          "Gift received",
                        ].includes(transaction.type) &&
                          transaction.type.charAt(0).toUpperCase() +
                            transaction.type.slice(1)}
                      </h4>
                      <p className="text-xs text-slate-400">
                        {formatDistanceToNow(new Date(transaction.createdAt), {
                          addSuffix: true,
                        })}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p
                      className={`text-sm font-semibold ${
                        parseFloat(transaction.amount) >= 0
                          ? "text-green-600 dark:text-green-400"
                          : "text-red-600 dark:text-red-400"
                      }`}
                    >
                      {parseFloat(transaction.amount) >= 0 ? "+" : ""}
                      {['Gifted', 'Gift received', 'challenge_escrow'].includes(transaction.type)
                        ? `${Math.abs(parseInt(transaction.amount)).toLocaleString()} coins`
                        : (typeof transaction.amount === 'number' || !isNaN(Number(transaction.amount)))
                          ? Number(transaction.amount).toLocaleString(undefined, { maximumFractionDigits: 4 })
                          : String(transaction.amount)
                      }
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Deposit Modal */}
        <Dialog open={isDepositModalOpen} onOpenChange={setIsDepositModalOpen}>
          <DialogContent className="rounded-2xl max-w-xs mx-auto border-0 bg-white dark:bg-slate-800">
            <DialogHeader className="pb-2">
              <DialogTitle className="text-center text-lg font-bold">Add USDC</DialogTitle>
              <DialogDescription className="text-center text-sm text-slate-500 dark:text-slate-400">
                Choose a way to fund your wallet
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              {/* Option 1: Buy with Card */}
              <button
                onClick={() => {
                  setIsDepositModalOpen(false);
                  fundWallet?.();
                }}
                className="w-full p-3 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                <div className="text-left">
                  <h3 className="font-semibold text-slate-900 dark:text-white text-xs">💳 Buy with Card</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Moonpay / Stripe</p>
                </div>
              </button>

              {/* Option 2: Bridge */}
              <button
                onClick={() => {
                  setIsDepositModalOpen(false);
                  window.open("https://stargate.finance", "_blank");
                }}
                className="w-full p-3 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                <div className="text-left">
                  <h3 className="font-semibold text-slate-900 dark:text-white text-xs">🌉 Bridge USDC</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Stargate / Across</p>
                </div>
              </button>

              {/* Option 3: Swap */}
              <button
                onClick={() => {
                  setIsDepositModalOpen(false);
                  window.open("https://uniswap.org", "_blank");
                }}
                className="w-full p-3 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                <div className="text-left">
                  <h3 className="font-semibold text-slate-900 dark:text-white text-xs">🔄 Swap for USDC</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Uniswap / DEX</p>
                </div>
              </button>

              {/* Option 4: Manual Transfer */}
              <button
                onClick={() => {
                  if (primaryWallet?.address) {
                    navigator.clipboard.writeText(primaryWallet.address);
                    toast({ title: "Address Copied", description: "Paste this address in your wallet to send USDC" });
                    setIsDepositModalOpen(false);
                  }
                }}
                className="w-full p-3 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                <div className="text-left">
                  <h3 className="font-semibold text-slate-900 dark:text-white text-xs">📤 Send from Another Wallet</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Copy your address to receive USDC</p>
                </div>
              </button>

              <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                <p className="text-xs text-slate-500 dark:text-slate-400 text-center">💡 Tip: Make sure you're sending USDC on the <strong>Base Testnet</strong> (Chain ID: 84532)</p>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Claim Modal */}
        <Dialog open={isClaimModalOpen} onOpenChange={setIsClaimModalOpen}>
          <DialogContent className="rounded-2xl max-w-xs mx-auto border-0 bg-white dark:bg-slate-800">
            <DialogHeader className="pb-2">
              <DialogTitle className="text-center text-lg font-bold">Claim Payouts</DialogTitle>
              <DialogDescription className="text-center text-sm text-slate-500 dark:text-slate-400">
                Claim winnings from resolved challenges
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              {claimableChallenges.length === 0 ? (
                <div className="text-center py-6 text-sm text-slate-500">No claimable payouts</div>
              ) : (
                claimableChallenges.map((c: any) => (
                  <div key={c.id} className="flex items-center justify-between p-2 border border-slate-100 dark:border-slate-700 rounded-lg">
                    <div className="text-left">
                      <div className="text-sm font-medium text-slate-900 dark:text-white">Challenge #{c.id}</div>
                      <div className="text-xs text-slate-500">Status: {c.onChainStatus || c.status}</div>
                    </div>
                    <div>
                      <Button
                        size="sm"
                        onClick={async () => {
                          if (claiming) return;
                          try {
                            setClaiming(true);
                            const res = await fetch(`/api/payouts/${c.id}/claim`, { method: 'POST' });
                            const body = await res.json();
                            if (!res.ok) throw new Error(body?.message || 'Claim failed');
                            toast({ title: 'Claim submitted', description: body.transactionHash || body.transaction_hash || 'Check blockchain for confirmation' });
                            setIsClaimModalOpen(false);
                            queryClient.invalidateQueries({ queryKey: ['/api/wallet/balance'] });
                            queryClient.invalidateQueries({ queryKey: ['/api/points/balance', user?.id] });
                          } catch (err: any) {
                            console.error('Claim error', err);
                            toast({ title: 'Claim failed', description: err.message || 'Unable to claim', variant: 'destructive' });
                          } finally {
                            setClaiming(false);
                          }
                        }}
                        disabled={claiming}
                      >
                        {claiming ? 'Claiming...' : 'Claim'}
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Mobile Footer Navigation */}
      <MobileNavigation />
    </div>
  );
}