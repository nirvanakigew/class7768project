import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useBlockchainChallenge } from "@/hooks/useBlockchainChallenge";
import { cn } from "@/lib/utils";
import { getGlobalChannel } from "@/lib/pusher";
import { MobileNavigation } from "@/components/MobileNavigation";
import { ChallengeCard } from "@/components/ChallengeCard";
import { ChallengeChat } from "@/components/ChallengeChat";
import { JoinChallengeModal } from "@/components/JoinChallengeModal";
import { ChallengePreviewCard } from "@/components/ChallengePreviewCard";
import { BantMap } from "@/components/BantMap";
import { Button } from "@/components/ui/button";
import CategoryBar from "@/components/CategoryBar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { UserAvatar } from "@/components/UserAvatar";
import {
  MessageCircle,
  Clock,
  Trophy,
  TrendingUp,
  Zap,
  Users,
  Shield,
  Search,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";

function ChallengeCardSkeleton() {
  return (
    <Card className="border border-slate-200 dark:border-slate-800 overflow-hidden min-h-[160px] bg-white dark:bg-slate-900 shadow-sm rounded-2xl animate-pulse">
      <CardContent className="p-4 flex flex-col h-full space-y-4">
        <div className="flex items-center space-x-3">
          <Skeleton className="h-12 w-12 rounded-full bg-slate-200 dark:bg-slate-800" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-4 w-3/4 rounded-full bg-slate-200 dark:bg-slate-800" />
            <Skeleton className="h-3 w-1/2 rounded-full bg-slate-200 dark:bg-slate-800" />
          </div>
        </div>
        <div className="space-y-2">
          <Skeleton className="h-3 w-full rounded-full bg-slate-100 dark:bg-slate-800/50" />
          <Skeleton className="h-3 w-5/6 rounded-full bg-slate-100 dark:bg-slate-800/50" />
        </div>
        <div className="pt-2 flex justify-between items-center">
          <Skeleton className="h-6 w-16 rounded-lg bg-slate-200 dark:bg-slate-800" />
          <Skeleton className="h-4 w-12 rounded-full bg-slate-100 dark:bg-slate-800/50" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function Challenges() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedChallenge, setSelectedChallenge] = useState<any>(null);
  const [showChat, setShowChat] = useState(false);
  const [challengeStatusTab, setChallengeStatusTab] = useState<'all' | 'open' | 'active' | 'pending' | 'completed' | 'ended'>('all');
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [selectedTab, setSelectedTab] = useState<string>('featured');
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [preSelectedUser, setPreSelectedUser] = useState<any>(null);
  const [createFormData, setCreateFormData] = useState({
    title: '',
    description: '',
    category: 'general',
    amount: 100,
    challengeType: 'open', // 'open' or 'direct'
    opponentId: null as string | null,
    dueDate: '' as string, // ISO string
    expirationHours: 24, // preset selector (hours)
  });

  // Listen for header search events dispatched from Navigation
  useEffect(() => {
    const onSearch = (e: any) => {
      const val = e?.detail ?? "";
      setSearchTerm(val);
    };
    const onOpen = () => setIsSearchOpen(true);

    window.addEventListener("challenges-search", onSearch as EventListener);
    window.addEventListener("open-challenges-search", onOpen as EventListener);

    return () => {
      window.removeEventListener("challenges-search", onSearch as EventListener);
      window.removeEventListener("open-challenges-search", onOpen as EventListener);
    };
  }, []);

  const { data: challenges = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/challenges"],
    queryFn: async () => {
      try {
        const response = await fetch("/api/challenges/public", {
          credentials: "include",
        });
        if (!response.ok) {
          throw new Error(`${response.status}: ${await response.json().then(e => e.message).catch(() => "Unknown error")}`);
        }
        const data = await response.json();
        return data.map((challenge: any) => ({
          ...challenge,
          commentCount: challenge.commentCount ?? 0,
          participantCount: challenge.participantCount ?? 0,
        }));
      } catch (error: any) {
        throw error;
      }
    },
    retry: false,
  });

  const { data: friends = [] as any[] } = useQuery({
    queryKey: ["/api/friends"],
    retry: false,
    enabled: !!user, // Only fetch when user is authenticated
  });

  const {
    data: allUsers = [] as any[],
    isLoading: usersLoading,
    error: usersError,
  } = useQuery({
    queryKey: ["/api/users"],
    retry: false,
    enabled: !!user, // Only fetch when user is authenticated
  });

  const { data: balance = 0 } = useQuery<any>({
    queryKey: ["/api/wallet/balance"],
    retry: false,
  });

  // Real-time listeners for challenge updates via Pusher
  useEffect(() => {
    const globalChannel = getGlobalChannel();
    
    // Listen for new challenge messages
    const handleNewMessage = (data: any) => {
      if (data.type === 'challenge_message' || data.challengeId) {
        queryClient.invalidateQueries({ queryKey: ["/api/challenges"] });
      }
    };

    // Listen for when users join challenges  
    const handleChallengeJoined = (data: any) => {
      if (data.type === 'challenge_joined' || data.challengeId) {
        queryClient.invalidateQueries({ queryKey: ["/api/challenges"] });
      }
    };

    globalChannel.bind('new-message', handleNewMessage);
    globalChannel.bind('challenge-joined', handleChallengeJoined);

    return () => {
      globalChannel.unbind('new-message', handleNewMessage);
      globalChannel.unbind('challenge-joined', handleChallengeJoined);
      globalChannel.unsubscribe();
    };
  }, [queryClient]);

  const { createP2PChallenge } = useBlockchainChallenge();

  const createChallengeMutation = useMutation({
    mutationFn: async (formData: typeof createFormData) => {
      // P2P challenges use USDC on Base Sepolia
      const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b3566dA8860';
      
      // For direct P2P: require opponent selection
      if (formData.challengeType === 'direct' && !preSelectedUser?.id) {
        throw new Error('Please select an opponent for direct challenge');
      }

      // Step 1: Store challenge in database
      const response = await fetch('/api/challenges/create-p2p', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          opponentId: formData.challengeType === 'direct' ? preSelectedUser.id : null,
          title: formData.title,
          description: formData.description,
          stakeAmount: formData.amount.toString(),
          paymentToken: USDC_ADDRESS,
          dueDate: formData.dueDate || null,
          metadataURI: 'ipfs://bafytest',
          challengeType: formData.challengeType,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create challenge');
      }

      const data = await response.json();

      // Step 2: Sign and submit to blockchain
      const stakeWei = String(Math.floor(formData.amount * 1e6));
      const pointsReward = "500"; // Fixed points for now

      toast({
        title: "Challenge Created",
        description: "Preparing blockchain transaction...",
      });

      try {
        await createP2PChallenge({
          opponentAddress: preSelectedUser.id,
          stakeAmount: stakeWei,
          paymentToken: USDC_ADDRESS,
          pointsReward,
          metadataURI: 'ipfs://bafytest',
        });
      } catch (blockchainError: any) {
        console.warn('Blockchain submission failed, but challenge is stored in DB:', blockchainError);
        // Don't throw - challenge is already in DB
      }

      return data;
    },
    onSuccess: () => {
      toast({
        title: "Challenge Created",
        description: "Your blockchain challenge has been created!",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/challenges"] });
      setIsCreateDialogOpen(false);
      setCreateFormData({ title: '', description: '', category: 'general', amount: 100, challengeType: 'open', opponentId: null, dueDate: '', expirationHours: 24 });
      setPreSelectedUser(null);
    },
    onError: (error: Error) => {
      if (error.message.includes('401') || error.message.includes('Unauthorized')) {
        toast({
          title: "Unauthorized",
          description: "Please log in to create a challenge",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Error",
        description: error.message || 'Failed to create challenge',
        variant: "destructive",
      });
    },
  });

  const categories = [
    { id: "create", label: "Create", icon: "/assets/create.png", gradient: "from-green-400 to-emerald-500", isCreate: true, value: "create" },
    { id: "all", label: "All", icon: "/assets/versus.svg", gradient: "from-blue-400 to-purple-500", value: "all" },
    { id: "sports", label: "Sports", icon: "/assets/sportscon.svg", gradient: "from-green-400 to-blue-500", value: "sports" },
    { id: "gaming", label: "Gaming", icon: "/assets/gamingsvg.svg", gradient: "from-gray-400 to-gray-600", value: "gaming" },
    { id: "crypto", label: "Crypto", icon: "/assets/cryptosvg.svg", gradient: "from-yellow-400 to-orange-500", value: "crypto" },
    { id: "trading", label: "Trading", icon: "/assets/cryptosvg.svg", gradient: "from-yellow-400 to-orange-500", value: "trading" },
    { id: "music", label: "Music", icon: "/assets/musicsvg.svg", gradient: "from-blue-400 to-purple-500", value: "music" },
    { id: "entertainment", label: "Entertainment", icon: "/assets/popcorn.svg", gradient: "from-pink-400 to-red-500", value: "entertainment" },
    { id: "politics", label: "Politics", icon: "/assets/poltiii.svg", gradient: "from-green-400 to-teal-500", value: "politics" },
  ];

  const filteredChallenges = challenges.filter((challenge: any) => {
    const searchLower = searchTerm ? searchTerm.toLowerCase() : "";
    const matchesSearch =
      !searchTerm ||
      (challenge.title || "").toLowerCase().includes(searchLower) ||
      (challenge.description || "").toLowerCase().includes(searchLower) ||
      (challenge.category || "").toLowerCase().includes(searchLower) ||
      (challenge.challengerUser?.username || "")
        .toLowerCase()
        .includes(searchLower) ||
      (challenge.challengedUser?.username || "")
        .toLowerCase()
        .includes(searchLower);

    const matchesCategory =
      selectedCategory === "all" || challenge.category === selectedCategory;

    // Determine admin-created flag explicitly
    const isAdminCreated = challenge.adminCreated === true;

    // Filter by challenge status or P2P tab
    const matchesStatus =
      challengeStatusTab === 'all' ? true :
      challengeStatusTab === 'p2p' ? !isAdminCreated :
      challengeStatusTab === 'open' ? challenge.status === 'open' :
      challengeStatusTab === 'active' ? challenge.status === 'active' :
      challengeStatusTab === 'pending' ? challenge.status === 'pending' :
      challengeStatusTab === 'completed' ? challenge.status === 'completed' :
      challengeStatusTab === 'ended' ? (challenge.status === 'completed' || challenge.status === 'cancelled' || challenge.status === 'disputed') :
      true;

    return matchesSearch && matchesCategory && matchesStatus;
  });

  const filteredUsers = (allUsers as any[]).filter((u: any) => {
    if (!searchTerm || u.id === user?.id) return false;
    if (u.isAdmin) return false; // Hide admin and superadmin users
    const searchLower = searchTerm.toLowerCase();
    const firstName = (u.firstName || "").toLowerCase();
    const lastName = (u.lastName || "").toLowerCase();
    const username = (u.username || "").toLowerCase();
    const fullName = `${firstName} ${lastName}`.trim();

    return (
      firstName.includes(searchLower) ||
      lastName.includes(searchLower) ||
      username.includes(searchLower) ||
      fullName.includes(searchLower)
    );
  });

  const pendingChallenges = filteredChallenges.filter(
    (c: any) => c.status === "pending" && !c.adminCreated && (c.challengerId === user?.id || c.challengedId === user?.id),
  );
  const activeChallenges = filteredChallenges.filter(
    (c: any) => c.status === "active" && !c.adminCreated,
  );
  const awaitingResolutionChallenges = filteredChallenges.filter(
    (c: any) => c.status === "pending_admin" && c.adminCreated && (c.challengerId === user?.id || c.challengedId === user?.id || c.creatorId === user?.id),
  );
  const completedChallenges = filteredChallenges.filter(
    (c: any) => c.status === "completed" && !c.adminCreated,
  );
  const featuredChallenges = filteredChallenges.filter(
    (c: any) => c.adminCreated && c.status !== "pending_admin",
  );

  // Validate selected tab - reset to featured if current tab is hidden
  useEffect(() => {
    const isTabVisible = 
      selectedTab === 'featured' || 
      selectedTab === 'active' ||
      selectedTab === 'completed' ||
      (user && selectedTab === 'pending' && pendingChallenges.length > 0) ||
      (user && selectedTab === 'awaiting_resolution' && awaitingResolutionChallenges.length > 0);
    
    if (!isTabVisible) {
      setSelectedTab('featured');
    }
  }, [selectedTab, user, pendingChallenges.length, awaitingResolutionChallenges.length]);

  const onSubmit = (data: z.infer<typeof createChallengeSchema>) => {
    const amount = parseFloat(data.amount);
    const currentBalance =
      balance && typeof balance === "object" ? (balance as any).balance : balance;

    if (amount > currentBalance) {
      toast({
        title: "Insufficient Balance",
        description: "You don't have enough funds to create this challenge.",
        variant: "destructive",
      });
      return;
    }

    createChallengeMutation.mutate(data);
  };

  const handleChallengeClick = (challenge: any) => {
    // Navigate to the challenge activity page instead of opening the modal.
    // This allows users to view the activity page even if they're not a participant.
    window.location.href = `/challenges/${challenge.id}/activity`;
  };

  const handleJoin = (challenge: any) => {
    setSelectedChallenge(challenge);
    setShowJoinModal(true);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-yellow-500";
      case "active":
        return "bg-green-500";
      case "completed":
        return "bg-blue-500";
      case "disputed":
        return "bg-red-500";
      case "cancelled":
        return "bg-gray-500";
      default:
        return "bg-gray-500";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pending":
        return Clock;
      case "active":
        return Zap;
      case "completed":
        return Trophy;
      case "disputed":
        return Shield;
      default:
        return Clock;
    }
  };

  // Handle authentication errors
  useEffect(() => {
    if (usersError && isUnauthorizedError(usersError as Error)) {
      toast({
        title: "Session Expired",
        description: "Please log in again to continue.",
        variant: "destructive",
      });
    }
  }, [usersError, toast]);

  if (!user) {
    // Allow unauthenticated users to view challenges but show login prompts for actions
  }

  const sortedChallenges = [...filteredChallenges].sort((a: any, b: any) => {
    // Priority 0: Pinned challenges first
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;

    // Priority 1: Pending (Action Required)
    const aIsPending = a.status === 'pending' && !a.adminCreated && (a.challengerId === user?.id || a.challengedId === user?.id);
    const bIsPending = b.status === 'pending' && !b.adminCreated && (b.challengerId === user?.id || b.challengedId === user?.id);
    if (aIsPending && !bIsPending) return -1;
    if (!aIsPending && bIsPending) return 1;

    // Priority 2: Active/Live
    const aIsActive = a.status === 'active';
    const bIsActive = b.status === 'active';
    if (aIsActive && !bIsActive) return -1;
    if (!aIsActive && bIsActive) return 1;

    // Priority 3: Featured/Open (Admin created matches)
    const aIsOpen = a.status === 'open' && a.adminCreated;
    const bIsOpen = b.status === 'open' && b.adminCreated;
    if (aIsOpen && !bIsOpen) return -1;
    if (!aIsOpen && bIsOpen) return 1;

    // Priority 4: Awaiting Resolution
    const aIsAwaiting = a.status === 'pending_admin';
    const bIsAwaiting = b.status === 'pending_admin';
    if (aIsAwaiting && !bIsAwaiting) return -1;
    if (!aIsAwaiting && bIsAwaiting) return 1;

    // Default: Newest first
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 theme-transition pb-[50px]">
      <div className="max-w-7xl mx-auto px-3 md:px-4 sm:px-6 lg:px-8 py-2 md:py-4">
        <CategoryBar
          categories={categories}
          selectedCategory={selectedCategory}
          onSelect={(id) => {
            if (id === 'create') {
              setIsCreateDialogOpen(true);
              return;
            }
            setSelectedCategory(id);
          }}
        />

        {/* Challenge Status Tabs */}
        <div className="overflow-x-auto scrollbar-hide -mx-3 px-3 pb-1 md:flex md:justify-center">
          <Tabs 
            defaultValue="all" 
            value={challengeStatusTab} 
            onValueChange={(val) => setChallengeStatusTab(val as any)} 
            className="w-full md:w-auto"
          >
            <TabsList className="inline-flex w-fit h-8 border-0 shadow-none bg-transparent gap-1 items-center">
              <TabsTrigger 
                value="all" 
                className="text-xs px-3 py-1.5 rounded-full data-[state=active]:bg-[#ccff00] data-[state=active]:text-black whitespace-nowrap bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm transition-all h-auto"
              >
                All
              </TabsTrigger>
              <TabsTrigger 
                value="p2p" 
                className="text-xs px-3 py-1.5 rounded-full data-[state=active]:bg-[#ccff00] data-[state=active]:text-black whitespace-nowrap bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm transition-all h-auto"
              >
                P2P
              </TabsTrigger>
              <TabsTrigger 
                value="open" 
                className="text-xs px-3 py-1.5 rounded-full data-[state=active]:bg-[#ccff00] data-[state=active]:text-black whitespace-nowrap bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm transition-all h-auto"
              >
                Open
              </TabsTrigger>
              <TabsTrigger 
                value="active" 
                className="text-xs px-3 py-1.5 rounded-full data-[state=active]:bg-[#ccff00] data-[state=active]:text-black whitespace-nowrap bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm transition-all h-auto"
              >
                Active
              </TabsTrigger>
              <TabsTrigger 
                value="pending" 
                className="text-xs px-3 py-1.5 rounded-full data-[state=active]:bg-[#ccff00] data-[state=active]:text-black whitespace-nowrap bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm transition-all h-auto"
              >
                Pending
              </TabsTrigger>
              <TabsTrigger 
                value="completed" 
                className="text-xs px-3 py-1.5 rounded-full data-[state=active]:bg-[#ccff00] data-[state=active]:text-black whitespace-nowrap bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm transition-all h-auto"
              >
                Completed
              </TabsTrigger>
              <TabsTrigger 
                value="ended" 
                className="text-xs px-3 py-1.5 rounded-full data-[state=active]:bg-[#ccff00] data-[state=active]:text-black whitespace-nowrap bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm transition-all h-auto"
              >
                Ended
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="mt-4">
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1">
              {[...Array(6)].map((_, i) => (
                <ChallengeCardSkeleton key={i} />
              ))}
            </div>
          ) : sortedChallenges.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1">
              {sortedChallenges.map((challenge) => (
                <ChallengeCard
                  key={challenge.id}
                  challenge={challenge}
                  onChatClick={handleChallengeClick}
                  onJoin={handleJoin}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-20">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 mb-4">
                <Search className="w-8 h-8 text-slate-400" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">No challenges found</h3>
              <p className="text-slate-500 dark:text-slate-400">Try adjusting your search or category filters</p>
            </div>
          )}
        </div>

        <Dialog
          open={isCreateDialogOpen}
          onOpenChange={(open) => {
            setIsCreateDialogOpen(open);
            if (!open) {
              setPreSelectedUser(null);
            }
          }}
        >
          <DialogContent className="sm:max-w-sm max-w-[90vw] max-h-[75vh] overflow-y-auto p-4">
            <DialogHeader className="pb-2">
              <DialogTitle className="text-base sm:text-lg">
                Create Challenge
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Challenge Type</label>
                <Select value={createFormData.challengeType} onValueChange={(val) => setCreateFormData({...createFormData, challengeType: val as 'open' | 'direct'})}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">🌍 Open Challenge (Anyone can join)</SelectItem>
                    <SelectItem value="direct">🎯 Direct Challenge (Challenge a specific user)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {createFormData.challengeType === 'direct' && (
                <div>
                  <label className="block text-sm font-medium mb-2">Challenge Opponent</label>
                  <div className="p-2 border rounded-lg bg-slate-50 dark:bg-slate-800 text-sm">
                    {preSelectedUser ? (
                      <div className="flex items-center justify-between">
                        <span>{preSelectedUser.username || preSelectedUser.firstName}</span>
                        <button
                          onClick={() => setPreSelectedUser(null)}
                          className="text-xs text-red-500 hover:text-red-600"
                        >
                          Change
                        </button>
                      </div>
                    ) : (
                      <span className="text-slate-500">Select an opponent to challenge</span>
                    )}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-2">Title</label>
                <Input 
                  placeholder="Challenge title"
                  value={createFormData.title}
                  onChange={(e) => setCreateFormData({...createFormData, title: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Description</label>
                <Textarea 
                  placeholder="What's this challenge about?"
                  value={createFormData.description}
                  onChange={(e) => setCreateFormData({...createFormData, description: e.target.value})}
                  className="min-h-24"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Category</label>
                <Select value={createFormData.category} onValueChange={(val) => setCreateFormData({...createFormData, category: val})}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sports">Sports</SelectItem>
                    <SelectItem value="gaming">Gaming</SelectItem>
                    <SelectItem value="crypto">Crypto</SelectItem>
                    <SelectItem value="trading">Trading</SelectItem>
                    <SelectItem value="music">Music</SelectItem>
                    <SelectItem value="entertainment">Entertainment</SelectItem>
                    <SelectItem value="politics">Politics</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Amount (in USDC)</label>
                <Input 
                  type="number"
                  placeholder="100"
                  value={createFormData.amount}
                  onChange={(e) => setCreateFormData({...createFormData, amount: parseInt(e.target.value) || 0})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Expiry / Due Date</label>
                <div className="flex gap-2">
                  <Input
                    type="datetime-local"
                    value={createFormData.dueDate}
                    onChange={(e) => setCreateFormData({...createFormData, dueDate: e.target.value})}
                    className="flex-1"
                  />
                  <Select value={String(createFormData.expirationHours)} onValueChange={(val) => {
                    const hours = parseInt(val);
                    const dt = new Date();
                    dt.setHours(dt.getHours() + hours);
                    setCreateFormData(prev => ({ ...prev, expirationHours: hours, dueDate: dt.toISOString().slice(0,16) }));
                  }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Preset" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1h</SelectItem>
                      <SelectItem value="3">3h</SelectItem>
                      <SelectItem value="6">6h</SelectItem>
                      <SelectItem value="12">12h</SelectItem>
                      <SelectItem value="24">24h</SelectItem>
                      <SelectItem value="48">48h</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-xs text-slate-500 mt-1">Set a specific due date/time or pick a preset duration from now.</p>
              </div>
              <div className="flex gap-2 pt-2">
                <Button 
                  variant="outline" 
                  onClick={() => setIsCreateDialogOpen(false)}
                  className="flex-1"
                  disabled={createChallengeMutation.isPending}
                >
                  Cancel
                </Button>
                <Button 
                  onClick={() => createChallengeMutation.mutate(createFormData)}
                  className="flex-1 bg-[#ccff00] text-black hover:bg-[#b8e600]"
                  disabled={
                    createChallengeMutation.isPending || 
                    !createFormData.title ||
                    (createFormData.challengeType === 'direct' && !preSelectedUser?.id)
                  }
                >
                  {createChallengeMutation.isPending ? 'Creating...' : 'Create'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Search results and other content below the feed */}
        {searchTerm && (
          <div className="mt-8 space-y-6">
             {/* Search content... */}
          </div>
        )}
      </div>

      {/* Challenge Chat Dialog */}
      {showChat && selectedChallenge && (
        <Dialog open={showChat} onOpenChange={setShowChat}>
          <DialogContent className="sm:max-w-4xl max-h-[80vh] p-0">
            <ChallengeChat
              challenge={selectedChallenge}
              onClose={() => setShowChat(false)}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Join Challenge Modal (for admin-created betting challenges) */}
      {showJoinModal && selectedChallenge && (
        <JoinChallengeModal
          isOpen={showJoinModal}
          onClose={() => setShowJoinModal(false)}
          challenge={selectedChallenge}
          userBalance={balance && typeof balance === "object" ? (balance as any).balance : (typeof balance === 'number' ? balance : 0)}
        />
      )}

      <MobileNavigation />
    </div>
  );
}
