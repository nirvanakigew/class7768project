import React, { useState, useEffect } from 'react';
import { X, Trophy, Users, TrendingUp, Star, Send, Zap, Swords, Bookmark, BookmarkCheck, QrCode } from 'lucide-react';
import { ProfileQRCode } from "@/components/ProfileQRCode";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { formatDistanceToNow } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { formatBalance } from "@/utils/currencyUtils";
import { UserAvatar } from "@/components/UserAvatar";
import { getLevelColor, getLevelIcon, getLevelName } from "@/utils/levelSystem";

interface ProfileCardProps {
  userId: string;
  onClose: () => void;
}

interface UserProfile {
  id: string;
  username: string;
  firstName?: string;
  email: string;
  profileImageUrl?: string;
  points: number;
  level: number;
  xp: number;
  streak: number;
  createdAt: string;
  isFollowing?: boolean;
  followerCount?: number;
  followingCount?: number;
  hasActiveChallenge?: boolean;
  challengeStatus?: string | null;
  isChallengedByMe?: boolean;
  stats?: {
    wins: number;
    activeChallenges: number;
    totalEarnings: number;
    coins?: number;
  };
}

const ProfileCard: React.FC<ProfileCardProps> = ({ userId, onClose }) => {
  const [showTipModal, setShowTipModal] = useState(false);
  const [showChallengeModal, setShowChallengeModal] = useState(false);
  const [showMilestoneAnimation, setShowMilestoneAnimation] = useState(false);
  const [tipAmount, setTipAmount] = useState('');
  const [challengeTitle, setChallengeTitle] = useState('');
  const [challengeDescription, setChallengeDescription] = useState('');
  const [challengeAmount, setChallengeAmount] = useState('');
  const [challengeType, setChallengeType] = useState('prediction');
  const [localIsFollowing, setLocalIsFollowing] = useState<boolean | undefined>(undefined);
  const [friendRequestStatus, setFriendRequestStatus] = useState<'none' | 'pending' | 'friends'>('none');
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: profile, isLoading, error } = useQuery({
    queryKey: [`/api/users/${userId}/profile`, currentUser?.id],
    queryFn: async () => {
      try {
        if (!userId) {
          throw new Error("User ID is required");
        }
        const data = await apiRequest("GET", `/api/users/${userId}/profile`);
        if (!data) {
          throw new Error("No profile data received");
        }
        return data as UserProfile;
      } catch (err) {
        console.error("Error fetching profile:", err);
        throw err;
      }
    },
    retry: 1,
    enabled: !!userId && userId.trim() !== '',
    staleTime: 0, // Force refresh
  });

  const profileCoins = profile?.stats?.coins ?? (profile as any)?.coins;

  // Fetch wallet balance
  const { data: walletData } = useQuery({
    queryKey: ["/api/wallet/balance"],
    queryFn: async () => {
      return await apiRequest("GET", "/api/wallet/balance");
    },
    enabled: showTipModal,
    staleTime: 30000,
  });

  // Update local follow state when profile loads
  useEffect(() => {
    if (profile) {
      setLocalIsFollowing(profile.isFollowing);
    }
  }, [profile?.id, profile?.isFollowing]);

  // Follow mutation
  const followMutation = useMutation({
    mutationFn: async (action: 'follow' | 'unfollow') => {
      return await apiRequest("POST", `/api/followers/${userId}/follow`);
    },
    onMutate: async (action) => {
      // Optimistic update
      const previousFollowing = localIsFollowing;
      setLocalIsFollowing(action === 'follow');
      return { previousFollowing };
    },
    onSuccess: (data) => {
      // Invalidate both profile queries to be safe
      queryClient.invalidateQueries({ queryKey: [`/api/users/${userId}/profile`, currentUser?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/public/profile", profile?.username] });
      
      // Update local state based on server response if available
      if (data && typeof data.isFollowing === 'boolean') {
        setLocalIsFollowing(data.isFollowing);
      }
      
      toast({
        title: "Success",
        description: localIsFollowing ? "User followed" : "User unfollowed",
      });
    },
    onError: (error: Error, _variables, context) => {
      // Rollback on error
      if (context) {
        setLocalIsFollowing(context.previousFollowing);
      }
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Friend request mutation
  const friendRequestMutation = useMutation({
    mutationFn: async () => {
      if (!userId) {
        throw new Error("User ID is required");
      }
      return await apiRequest("POST", `/api/friends/request`, {
        targetUserId: userId
      });
    },
    onSuccess: () => {
      setFriendRequestStatus('pending');
      queryClient.invalidateQueries({ queryKey: ["/api/friends"] });
      queryClient.invalidateQueries({ queryKey: [`/api/users/${userId}/profile`, currentUser?.id] });
      toast({
        title: "Friend Request Sent",
        description: `Friend request sent to ${profile?.firstName || profile?.username}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send friend request",
        variant: "destructive",
      });
    },
  });

  // Tip mutation
  const tipMutation = useMutation({
    mutationFn: async (amount: number) => {
      if (!userId || !profile) {
        throw new Error("User information not available");
      }
      return await apiRequest("POST", `/api/users/${userId}/tip`, {
        amount
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wallet/balance"] });
      queryClient.invalidateQueries({ queryKey: [`/api/users/${userId}/profile`] });
      toast({
        title: "Tip Sent",
        description: `Successfully sent ${formatBalance(parseInt(tipAmount))} to ${profile?.firstName || profile?.username || 'User'}`,
      });
      setShowTipModal(false);
      setTipAmount('');
    },
    onError: (error: Error) => {
      console.error("Tip error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to send tip",
        variant: "destructive",
      });
    },
  });

  // Challenge mutation
  const challengeMutation = useMutation({
    mutationFn: async (challengeData: any) => {
      const data = {
        ...challengeData,
        challenged: userId,
        dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Added due date
      };
      return await apiRequest("POST", `/api/challenges`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/challenges"] });
      toast({
        title: "Challenge Sent",
        description: `Challenge sent to ${profile?.firstName || profile?.username}`,
      });
      setShowChallengeModal(false);
      setChallengeTitle('');
      setChallengeDescription('');
      setChallengeAmount('');
      setChallengeType('prediction');
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleFollow = () => {
    const action = localIsFollowing ? 'unfollow' : 'follow';
    followMutation.mutate(action);
  };

  const handleTip = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseInt(tipAmount);

    if (isNaN(amount) || amount <= 0) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid amount",
        variant: "destructive",
      });
      return;
    }

    tipMutation.mutate(amount);
  };

  const handleChallenge = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseInt(challengeAmount);

    if (isNaN(amount) || amount <= 0) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid stake amount",
        variant: "destructive",
      });
      return;
    }

    challengeMutation.mutate({
      title: challengeTitle,
      description: challengeDescription,
      amount,
      category: challengeType,
    });
  };

  // XP Milestone Animation Effect
  useEffect(() => {
    if (profile) {
      const nextLevelXP = profile.level * 1000;
      const currentLevelXP = (profile.level - 1) * 1000;
      const progressXP = profile.xp - currentLevelXP;

      // Check if user is close to next level (within 50 XP)
      if (nextLevelXP - profile.xp <= 50) {
        setShowMilestoneAnimation(true);
        setTimeout(() => setShowMilestoneAnimation(false), 3000);
      }
    }
  }, [profile]);

  const MilestoneAnimation = () => (
    <AnimatePresence>
      {showMilestoneAnimation && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          className="absolute inset-0 bg-gradient-to-br from-yellow-500/20 to-orange-500/20 rounded-lg flex items-center justify-center"
        >
          <motion.div
            animate={{
              scale: [1, 1.2, 1],
              rotate: [0, 360],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            className="text-yellow-500"
          >
            <Zap className="w-8 h-8" />
          </motion.div>
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="ml-3 text-yellow-700 dark:text-yellow-300 font-bold"
          >
            Almost Level {(profile?.level || 0) + 1}!
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (isLoading) {
    return null;
  }

  if (error) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
        onClick={onClose}
      >
        <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
          <CardContent className="p-6 text-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="absolute top-2 right-2 h-6 w-6 p-0 focus:outline-none focus:ring-0"
            >
              <X className="h-3 w-3" />
            </Button>
            <div className="text-red-500 mb-4">
              <i className="fas fa-exclamation-triangle text-2xl mb-2"></i>
              <p className="font-semibold">Failed to load user profile</p>
              <p className="text-sm text-slate-600 mt-1">
                {error.message || "Unable to fetch profile data"}
              </p>
              {!userId && (
                <p className="text-xs text-slate-500 mt-1">User ID is missing</p>
              )}
            </div>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={() => window.location.reload()} 
                className="flex-1"
              >
                Retry
              </Button>
              <Button onClick={onClose} className="flex-1">Close</Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  if (!profile) {
    return null;
  }

  const calculateLevel = (xp: number) => Math.floor(xp / 1000) + 1;
  const currentLevel = profile?.level || 1;
  const currentXP = profile?.xp || 0;
  const currentLevelXP = (currentLevel - 1) * 1000;
  const nextLevelXP = currentLevel * 1000;
  const progressXP = currentXP - currentLevelXP;
  const levelProgress = Math.max(0, Math.min(100, (progressXP / (nextLevelXP - currentLevelXP)) * 100));

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-xs md:max-w-sm"
        >
          <Card className="bg-white dark:bg-slate-900 shadow-md border-0 overflow-hidden">
            <CardContent className="p-2 md:p-4 relative">
              {/* Close Button */}
              <div className="absolute top-1 md:top-2 right-1 md:right-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onClose}
                  className="h-5 w-5 md:h-6 md:w-6 p-0 hover:bg-slate-100 dark:hover:bg-slate-800 border-0 focus:outline-none focus:ring-0"
                >
                  <X className="h-3 w-3 md:h-3 md:w-3" />
                </Button>
              </div>

              {/* Profile Avatar - Smaller on mobile */}
              <div className="flex justify-center mt-1 md:mt-2 mb-2 md:mb-3">
                <div className="relative">
                  <UserAvatar
                    userId={profile.id || userId}
                    username={profile.username}
                    size={64}
                    className="w-14 h-14 md:w-16 md:h-16 border-2 md:border-3 border-white dark:border-slate-900 shadow-sm"
                  />
                  <div className="absolute -bottom-1 -right-1">
                    <Badge className={`${getLevelColor(profile.level || 1)} text-xs font-semibold border-2 border-white dark:border-slate-900 shadow-sm p-0.5`}>
                      <img 
                        src={getLevelIcon(profile.level || 1)} 
                        alt={`${getLevelName(profile.level || 1)} Level ${profile.level || 1} badge`} 
                        className="w-2 h-2 md:w-2.5 md:h-2.5" 
                      />
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Profile Info - More compact on mobile */}
              <div className="text-center space-y-0.5 md:space-y-1 mb-2 md:mb-3">
                <h2 className="text-base md:text-lg font-bold text-slate-900 dark:text-slate-100">
                  {profile?.username || 'User'}
                </h2>
              </div>

              {/* Stats Section - More compact on mobile */}
              <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 md:gap-x-6 md:gap-y-3 mb-2 md:mb-3">
                <div className="text-center">
                  <div className="flex items-center justify-center w-7 h-7 md:w-8 md:h-8 bg-emerald-100 dark:bg-emerald-900/30 rounded-full mx-auto mb-0.5 md:mb-1">
                    <Trophy className="w-3 h-3 md:w-4 md:h-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="text-[13px] md:text-base font-bold text-slate-900 dark:text-slate-100">
                    {profile.stats?.totalEarnings ? `₦${Number(profile.stats.totalEarnings).toLocaleString()}` : '₦0'}
                  </div>
                  <div className="text-[10px] text-slate-600 dark:text-slate-400">earned</div>
                </div>

                <div className="text-center">
                  <div className="flex items-center justify-center w-7 h-7 md:w-8 md:h-8 bg-blue-100 dark:bg-blue-900/30 rounded-full mx-auto mb-0.5 md:mb-1">
                    <Users className="w-3 h-3 md:w-4 md:h-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="text-[13px] md:text-base font-bold text-slate-900 dark:text-slate-100">
                    {profile.followerCount || 0}
                  </div>
                  <div className="text-[10px] text-slate-600 dark:text-slate-400">followers</div>
                </div>

                <div className="text-center">
                  <div className="flex items-center justify-center w-7 h-7 md:w-8 md:h-8 bg-purple-100 dark:bg-purple-900/30 rounded-full mx-auto mb-0.5 md:mb-1">
                    <Users className="w-3 h-3 md:w-4 md:h-4 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div className="text-[13px] md:text-base font-bold text-slate-900 dark:text-slate-100">
                    {profile.followingCount || 0}
                  </div>
                  <div className="text-[10px] text-slate-600 dark:text-slate-400">following</div>
                </div>

                <div className="text-center">
                  <div className="flex items-center justify-center w-7 h-7 md:w-8 md:h-8 bg-yellow-100 dark:bg-yellow-900/30 rounded-full mx-auto mb-0.5 md:mb-1">
                    <Zap className="w-3 h-3 md:w-4 md:h-4 text-yellow-600 dark:text-yellow-400" />
                  </div>
                  <div className="text-[13px] md:text-base font-bold text-slate-900 dark:text-slate-100">
                    {profileCoins ? Number(profileCoins).toLocaleString() : '0'}
                  </div>
                  <div className="text-[10px] text-slate-600 dark:text-slate-400">coins</div>
                </div>
              </div>

              {/* Action Button - Smaller on mobile */}
              {currentUser && currentUser.id !== profile.id && (
                <Button 
                  onClick={() => setShowChallengeModal(true)}
                  className="w-full py-1.5 md:py-2 rounded-xl font-semibold shadow-sm text-xs md:text-sm text-black mt-2"
                  style={{ backgroundColor: "#ccff00" }}
                  size="sm"
                >
                  Challenge me
                </Button>
              )}

              {/* Secondary Actions - More compact on mobile */}
              {currentUser && currentUser.id !== profile.id && (
                <div className="grid grid-cols-2 gap-1 md:gap-1.5 mt-1.5 md:mt-2">
                  <Button
                    onClick={handleFollow}
                    disabled={followMutation.isPending}
                    variant="outline"
                    className="rounded-xl border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs py-1 md:py-1.5 focus:outline-none focus:ring-0 h-auto"
                  >
                    {followMutation.isPending ? (
                      <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-current"></div>
                    ) : (
                      localIsFollowing ? 'Following' : 'Follow'
                    )}
                  </Button>

                  <Button
                    onClick={() => friendRequestMutation.mutate()}
                    disabled={friendRequestMutation.isPending || friendRequestStatus !== 'none'}
                    variant="outline"
                    className="rounded-xl border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs py-1 md:py-1.5 focus:outline-none focus:ring-0 h-auto"
                  >
                    {friendRequestMutation.isPending ? (
                      <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-current"></div>
                    ) : friendRequestStatus === 'pending' ? (
                      'Pending'
                    ) : friendRequestStatus === 'friends' ? (
                      'Friends'
                    ) : (
                      'Add'
                    )}
                  </Button>

                  <Button
                    onClick={() => setShowTipModal(true)}
                    variant="outline"
                    className="rounded-xl border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs py-1 md:py-1.5 focus:outline-none focus:ring-0 h-auto"
                  >
                    <Send className="w-3 h-3 mr-0.5" />
                    Gift
                  </Button>

                  <ProfileQRCode
                    username={profile.username}
                    fullName={profile.firstName || profile.username}
                    profileImageUrl={profile.profileImageUrl}
                    size="sm"
                    trigger={
                      <Button
                        variant="outline"
                        className="rounded-xl border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 py-1 md:py-1.5 focus:outline-none focus:ring-0 h-auto w-full"
                      >
                        <QrCode className="w-3 h-3" />
                      </Button>
                    }
                  />
                </div>
              )}

              {/* For current user's own profile */}
              {currentUser && currentUser.id === profile.id && (
                <div className="mt-1.5">
                  <ProfileQRCode
                    username={profile.username}
                    fullName={profile.firstName || profile.username}
                    profileImageUrl={profile.profileImageUrl}
                    trigger={
                      <Button
                        variant="outline"
                        className="w-full rounded-xl border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 py-1.5 md:py-2 text-xs md:text-sm"
                      >
                        <QrCode className="w-3 h-3 mr-1.5" />
                        Share Profile QR
                      </Button>
                    }
                  />
                </div>
              )}

              {/* XP Progress */}
              <div className="mt-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Level {(profile.level || 1) + 1}
                  </span>
                  <span className="text-xs text-slate-600 dark:text-slate-400">
                    {Math.round(levelProgress)}%
                  </span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${levelProgress}%` }}
                    transition={{ duration: 1, ease: "easeOut" }}
                  />
                </div>
                <MilestoneAnimation />
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>

      {/* Challenge Modal */}
      <Dialog open={showChallengeModal} onOpenChange={setShowChallengeModal}>
        <DialogContent className="sm:max-w-sm max-w-[90vw] max-h-[80vh] overflow-y-auto border-0 shadow-md">
          <DialogHeader className="pb-2">
            <DialogTitle className="text-lg font-bold text-center">
              Challenge {profile.firstName || profile.username}
            </DialogTitle>
            <div className="flex justify-center">
              <div className="w-8 h-8 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                <Swords className="w-4 h-4 text-red-600 dark:text-red-400" />
              </div>
            </div>
          </DialogHeader>

          <form onSubmit={handleChallenge} className="space-y-2">
            <div className="space-y-0">
              <Input
                id="challengeTitle"
                value={challengeTitle}
                onChange={(e) => setChallengeTitle(e.target.value)}
                placeholder="Challenge Title"
                className="h-9 text-sm rounded-lg border-slate-200 dark:border-slate-700 focus:ring-1 focus:ring-primary"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-0">
                <Select value={challengeType} onValueChange={setChallengeType}>
                  <SelectTrigger className="h-9 rounded-lg px-3 text-sm border-0 bg-slate-100 dark:bg-slate-800 focus:ring-0 focus:border-0 shadow-none ring-0 outline-none">
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:bg-slate-900 border-0 shadow-xl p-1">
                    <SelectItem value="prediction" className="text-sm focus:bg-primary/10 focus:text-primary dark:focus:bg-primary/20 rounded-md border-0">🔮 Prediction</SelectItem>
                    <SelectItem value="skill" className="text-sm focus:bg-primary/10 focus:text-primary dark:focus:bg-primary/20 rounded-md border-0">🎮 Skill</SelectItem>
                    <SelectItem value="trivia" className="text-sm focus:bg-primary/10 focus:text-primary dark:focus:bg-primary/20 rounded-md border-0">🧠 Trivia</SelectItem>
                    <SelectItem value="custom" className="text-sm focus:bg-primary/10 focus:text-primary dark:focus:bg-primary/20 rounded-md border-0">🎯 Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-0">
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">₦</span>
                  <Input
                    id="challengeAmount"
                    type="number"
                    value={challengeAmount}
                    onChange={(e) => setChallengeAmount(e.target.value)}
                    placeholder="Stake"
                    className="h-9 pl-6 rounded-lg text-sm border-slate-200 dark:border-slate-700 focus:ring-1 focus:ring-primary"
                    min="1"
                    required
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <Button 
                type="button" 
                variant="ghost" 
                onClick={() => setShowChallengeModal(false)}
                className="flex-1 h-9 text-sm rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={challengeMutation.isPending || !challengeTitle || !challengeAmount}
                className="flex-1 h-9 text-sm font-bold rounded-lg text-black transition-transform active:scale-95 shadow-sm"
                style={{ backgroundColor: "#ccff00" }}
              >
                {challengeMutation.isPending ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
                ) : (
                  <>
                    <Swords className="w-4 h-4 mr-2" />
                    Challenge
                  </>
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Tip Modal */}
      <Dialog open={showTipModal} onOpenChange={setShowTipModal}>
        <DialogContent className="sm:max-w-sm max-w-[90vw] p-4 border-0 shadow-lg">
          <DialogHeader className="pb-2">
            <DialogTitle className="text-lg font-bold text-center flex items-center justify-center gap-2">
              <Send className="w-5 h-5 text-purple-600" />
              Gift Coins
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleTip} className="space-y-4">
            <div className="space-y-2 text-center">
              <Label htmlFor="tipAmount" className="text-sm font-medium">Amount to gift</Label>
              <div className="relative max-w-[200px] mx-auto">
                <Input
                  id="tipAmount"
                  type="number"
                  value={tipAmount}
                  onChange={(e) => setTipAmount(e.target.value)}
                  placeholder="500"
                  className="h-10 text-lg font-bold text-center rounded-xl border-slate-200 dark:border-slate-700 focus:ring-purple-500"
                  min="1"
                  required
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 font-medium">coins</div>
              </div>
              <p className="text-xs text-slate-500">
                Current Balance: {Number(walletData?.coins || 0).toLocaleString()} coins
              </p>
            </div>

            <div className="flex space-x-2 pt-2">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setShowTipModal(false)}
                className="flex-1 h-10 rounded-xl border-slate-200 dark:border-slate-700"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={tipMutation.isPending}
                className="flex-1 h-10 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold"
              >
                {tipMutation.isPending ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                ) : (
                  'Send Gift'
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ProfileCard;