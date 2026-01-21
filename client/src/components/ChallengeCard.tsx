import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { formatDistanceToNow } from "date-fns";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { SocialMediaShare } from "@/components/SocialMediaShare";
import {
  MessageCircle,
  Check,
  X,
  Eye,
  Trophy,
  Share2,
  Zap,
  Lock,
  Pin,
  Hourglass,
} from "lucide-react";
import { CompactShareButton } from "@/components/ShareButton";
import { shareChallenge } from "@/utils/sharing";
import { UserAvatar } from "@/components/UserAvatar";
import { getAvatarUrl } from "@/utils/avatarUtils";
import { useLocation } from "wouter";
import { useState } from "react";
import ProfileCard from "@/components/ProfileCard";
import { Dialog, DialogContent } from "@/components/ui/dialog";

// Simple category -> emoji/icon mapping
function CategoryIcon({ category }: { category?: string }) {
  const map: Record<string, string> = {
    general: "📌",
    test: "🧪",
    sports: "⚽",
    politics: "🏛️",
    finance: "💰",
    entertainment: "🎬",
  };

  const icon = (category && map[category.toLowerCase()]) || "📢";
  return (
    <span aria-hidden className="text-sm">
      {icon}
    </span>
  );
}

interface ChallengeCardProps {
  challenge: {
    id: number;
    challenger: string;
    challenged: string;
    title: string;
    description?: string;
    category: string;
    amount: string;
    status: string;
    dueDate?: string;
    createdAt: string;
    adminCreated?: boolean;
    bonusSide?: string;
    bonusMultiplier?: string;
    bonusEndsAt?: string;
    bonusAmount?: number; // Custom bonus amount in naira
    yesStakeTotal?: number;
    noStakeTotal?: number;
    coverImageUrl?: string;
    participantCount?: number;
    commentCount?: number;
    earlyBirdSlots?: number;
    earlyBirdBonus?: number;
    streakBonusEnabled?: boolean;
    convictionBonusEnabled?: boolean;
    firstTimeBonusEnabled?: boolean;
    socialTagBonus?: number;
    challengerUser?: {
      id: string;
      firstName?: string;
      lastName?: string;
      username?: string;
      profileImageUrl?: string;
    };
    challengedUser?: {
      id: string;
      firstName?: string;
      lastName?: string;
      username?: string;
      profileImageUrl?: string;
    };
    isPinned?: boolean;
  };
  onChatClick?: (challenge: any) => void;
  onJoin?: (challenge: any) => void;
}

export function ChallengeCard({
  challenge,
  onChatClick,
  onJoin,
}: ChallengeCardProps) {
  const queryClient = useQueryClient();
  const { isAuthenticated, login, user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showAcceptModal, setShowAcceptModal] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);

  const handleAvatarClick = (e: React.MouseEvent, profileId: string | undefined) => {
    if (challenge.adminCreated || !profileId) return;
    e.stopPropagation();

    if (!isAuthenticated) {
      toast({
        title: "Authentication Required",
        description: "Please log in to view user profiles",
      });
      login();
      return;
    }

    setSelectedProfileId(profileId);
    setShowProfileModal(true);
  };

  // Check if bonus is active
  const isBonusActive =
    challenge.bonusEndsAt && new Date(challenge.bonusEndsAt) > new Date();

  const getBonusBadge = () => {
    const bonuses: any[] = [];
    
    // Original weak side bonus
    if (isBonusActive && challenge.bonusSide) {
      const amount = challenge.bonusAmount ? `₦${challenge.bonusAmount.toLocaleString()}` : `${challenge.bonusMultiplier}x`;
      bonuses.push({
        type: "weak_side",
        label: amount,
        icon: <Zap className="w-3 h-3" />,
        side: challenge.bonusSide,
        description: `Bonus for ${challenge.bonusSide} side`
      });
    }

    // Early Bird
    if (challenge.earlyBirdSlots && challenge.earlyBirdSlots > 0) {
      bonuses.push({
        type: "early_bird",
        label: "Early",
        icon: <Zap className="w-3 h-3" />,
        description: `Bonus for first ${challenge.earlyBirdSlots} users`
      });
    }

    // Streak
    if (challenge.streakBonusEnabled) {
      bonuses.push({
        type: "streak",
        label: "Streak",
        icon: <Trophy className="w-3 h-3" />,
        description: "Win streak bonus active"
      });
    }

    return bonuses;
  };

  const activeBonuses = getBonusBadge();

  // Generate sharing data for the challenge
  const challengeShareData = shareChallenge(
    challenge.id.toString(),
    challenge.title,
    challenge.amount,
  );

  const acceptChallengeMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", `/api/challenges/${challenge.id}/accept`);
    },
    onSuccess: () => {
      toast({
        title: "Challenge Accepted",
        description: "You have successfully accepted the challenge!",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/challenges"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const declineChallengeMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", `/api/challenges/${challenge.id}`, {
        status: "cancelled",
      });
    },
    onSuccess: () => {
      toast({
        title: "Challenge Declined",
        description: "You have declined the challenge.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/challenges"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const pinChallengeMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", `/api/challenges/${challenge.id}/pin`, {
        pin: !challenge.isPinned
      });
    },
    onSuccess: () => {
      toast({
        title: challenge.isPinned ? "Unpinned" : "Pinned",
        description: challenge.isPinned ? "Challenge unpinned from top" : "Challenge pinned to top",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/challenges"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const acceptOpenChallengeMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", `/api/challenges/${challenge.id}/accept-open`);
    },
    onSuccess: (data: any) => {
      toast({
        title: "✓ Challenge Accepted!",
        description: "You're in! Both stakes are now locked on-chain.",
      });
      setShowAcceptModal(false);
      queryClient.invalidateQueries({ queryKey: ["/api/challenges"] });
    },
    onError: (error: Error) => {
      toast({
        title: "❌ Error",
        description: error.message || "Failed to accept challenge. Someone may have accepted it first!",
        variant: "destructive",
      });
    },
  });

  const isEnded = challenge.status === 'completed' || (challenge.dueDate && new Date(challenge.dueDate).getTime() <= Date.now());

  const isNewChallenge = !!challenge.createdAt && (Date.now() - new Date(challenge.createdAt).getTime()) < 24 * 60 * 60 * 1000 && !isEnded;

  const getStatusBadge = (status: string) => {
    if (challenge.adminCreated) {
      if (status === "pending_admin" || status === "active") {
        return (
          <Badge className="bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300">
            Awaiting Result
          </Badge>
        );
      }
      if (status === "completed") {
        return (
          <Badge className="bg-gray-100 dark:bg-gray-900 text-gray-700 dark:text-gray-300">
            Ended
          </Badge>
        );
      }
      if (isNewChallenge) {
        return (
          <Badge className="bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300">
            New
          </Badge>
        );
      }
      return null;
    }

    switch (status) {
      case "pending":
        return (
          <Badge className="bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300">
            Pending
          </Badge>
        );
      case "active":
        return (
          <Badge className="bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300">
            Live
          </Badge>
        );
      case "completed":
        return (
          <Badge className="bg-gray-100 dark:bg-gray-900 text-gray-700 dark:text-gray-300">
            Ended
          </Badge>
        );
      case "disputed":
        return (
          <Badge className="bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300">
            Disputed
          </Badge>
        );
      case "cancelled":
        return (
          <Badge className="bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300">
            Cancelled
          </Badge>
        );
      case "pending_admin":
        return (
          <Badge className="bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300 flex items-center gap-1 w-fit">
            <Hourglass className="w-3 h-3" />
            Payout
          </Badge>
        );
      default:
        return null;
    }
  };

  // Check if current user is a participant in this challenge
  const isMyChallenge =
    user?.id === challenge.challenger || user?.id === challenge.challenged;

  // Display challenger vs challenged format for all challenges
  // For admin-created open challenges with no users, show "Open Challenge"
  const isOpenAdminChallenge =
    challenge.adminCreated &&
    challenge.status === "open" &&
    !challenge.challenger &&
    !challenge.challenged;

  const challengerName =
    challenge.challengerUser?.firstName ||
    challenge.challengerUser?.username ||
    "Unknown User";
  const challengedName =
    challenge.challengedUser?.firstName ||
    challenge.challengedUser?.username ||
    "Unknown User";
  
  // Show challenge title for all challenges - avatar pair at bottom shows who has joined
  const isOpenChallenge = challenge.status === "open";
  const displayName = challenge.title;

  // For avatar, show the other user (opponent) if current user is involved, otherwise show challenger
  const otherUser =
    user?.id === challenge.challenger
      ? challenge.challengedUser
      : user?.id === challenge.challenged
        ? challenge.challengerUser
        : challenge.challengerUser;
  const timeAgo = formatDistanceToNow(new Date(challenge.createdAt), {
    addSuffix: true,
  });

  // Helper function to get status text for the card
  const getStatusText = () => {
    switch (challenge.status) {
      case "pending":
        return "Waiting for your response";
      case "active":
        return "Challenge in progress";
      case "completed":
        return "Challenge concluded";
      case "disputed":
        return "Challenge disputed";
      case "cancelled":
        return "Challenge cancelled";
      case "pending_admin":
        return "Processing payout";
      default:
        return challenge.status;
    }
  };

  // Helper function for compact time format
  const getCompactTimeAgo = (date: string) => {
    const now = new Date();
    const created = new Date(date);
    const diffMs = now.getTime() - created.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;

    const diffWeeks = Math.floor(diffDays / 7);
    return `${diffWeeks}w`;
  };

  const isHeadToHeadMatched = !challenge.adminCreated && !!challenge.challenger && !!challenge.challenged;
  const hasJoined = user?.id === challenge.challenger || user?.id === challenge.challenged;

  // Do not make the whole card clickable. Only the action buttons (Join, Chat, Share)
  // should be interactive to avoid accidental opens of modals or chat.
  const cardClickProps = {};

  return (
    <Card
      className="border border-slate-200 dark:border-slate-600 theme-transition h-full overflow-hidden"
      {...cardClickProps}
    >
      <CardContent className="p-2 md:p-3 flex flex-col h-full">
        <div className="flex items-start justify-between gap-1.5 mb-1.5">
          <div className="flex items-start space-x-2 min-w-0 flex-1">
            {/* Show cover art for all challenges */}
            {challenge.coverImageUrl ? (
              <div className="flex items-center flex-shrink-0">
                <img
                  src={challenge.coverImageUrl}
                  alt="challenge cover"
                  className="w-9 h-9 md:w-10 md:h-10 rounded-md object-cover"
                />
              </div>
            ) : (
              <div className="flex items-center flex-shrink-0">
                <img
                  src="/assets/bantahblue.svg"
                  alt="platform"
                  className="w-9 h-9 md:w-10 md:h-10"
                />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <button
                onClick={() => navigate(`/challenges/${challenge.id}/activity`)}
                className="font-bold text-xs md:text-sm text-slate-900 dark:text-slate-100 line-clamp-1 mb-0 hover:text-primary dark:hover:text-primary/80 transition-colors text-left w-full"
                data-testid="link-challenge-detail"
              >
                {String(challenge.title)}
              </button>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium uppercase tracking-tight">
                ₦{(parseFloat(String(challenge.amount)) || 0).toLocaleString()} Stake
              </p>
            </div>
          </div>
          <div className="flex items-center gap-0.5 flex-shrink-0 flex-wrap">
            <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-0.5">
              {challenge.status === "open" && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isAuthenticated) {
                      toast({
                        title: "Authentication Required",
                        description: "Please log in to accept challenges",
                      });
                      login();
                      return;
                    }
                    if (user?.id === challenge.challenger) {
                      toast({
                        title: "Cannot Accept",
                        description: "You cannot accept your own challenge",
                        variant: "destructive",
                      });
                      return;
                    }
                    setShowAcceptModal(true);
                  }}
                  disabled={!isAuthenticated || user?.id === challenge.challenger}
                  className={`${isNewChallenge ? "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300" : "bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300"} border-none text-[10px] px-2 py-0.5 rounded-md font-semibold transition-all cursor-pointer hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {isNewChallenge ? "New" : "Open"}
                </button>
              )}
              {challenge.status !== "open" && getStatusBadge(challenge.status)}
              {!challenge.adminCreated && (
                <Badge className="bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 border-none text-[10px] px-2 py-0.5">
                  P2P
                </Badge>
              )}
              {/* Bonus badges - show right before share icon */}
              {activeBonuses.map((bonus, idx) => (
                <Badge key={idx} variant="secondary" className="text-[9px] bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border-none px-1.5 py-0.5">
                  {bonus.icon}
                  <span className="ml-0.5 font-bold">{bonus.label}</span>
                </Badge>
              ))}
            </div>
            {/* Admin pin button */}
            {(user as any)?.isAdmin && challenge.adminCreated && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  pinChallengeMutation.mutate();
                }}
                data-testid="button-pin-challenge"
                className="text-primary hover:scale-110 transition-transform flex-shrink-0"
                title={challenge.isPinned ? "Unpin from top" : "Pin to top"}
              >
                <Pin className={`h-4 w-4 ${challenge.isPinned ? "fill-current" : ""}`} />
              </button>
            )}
            {/* Always show share button */}
            <div onClick={(e) => e.stopPropagation()}>
              <CompactShareButton
                shareData={challengeShareData.shareData}
                className="text-primary h-4 w-4 hover:scale-110 transition-transform flex-shrink-0"
              />
            </div>
          </div>
        </div>

        <div className="mb-2">
          {!challenge.adminCreated ? (
            <div className="flex flex-col items-center justify-center bg-slate-50/50 dark:bg-slate-800/30 rounded-lg py-2 px-3 border border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="flex flex-col items-center">
                  <UserAvatar 
                    userId={challenge.challengerUser?.id || ""} 
                    username={challenge.challengerUser?.username || challengerName}
                    size={36}
                    className={`w-9 h-9 ring-2 ring-white dark:ring-slate-800 shadow-sm ${!challenge.adminCreated ? 'cursor-pointer hover:opacity-80' : ''}`}
                    onClick={(e) => handleAvatarClick(e, challenge.challengerUser?.id)}
                  />
                  <span className="text-[9px] font-bold text-slate-500 mt-1 truncate max-w-[56px]">@{challenge.challengerUser?.username || "challenger"}</span>
                </div>
                
                <div className="flex flex-col items-center">
                  <div className="bg-slate-100 dark:bg-slate-800 rounded-full p-1 border border-slate-200 dark:border-slate-700">
                    <span className="text-[8px] font-black text-slate-400 dark:text-slate-500 italic uppercase leading-none">VS</span>
                  </div>
                </div>

                <div className="flex flex-col items-center">
                  <UserAvatar 
                    userId={challenge.challengedUser?.id || ""} 
                    username={challenge.challengedUser?.username || challengedName}
                    size={36}
                    className={`w-9 h-9 ring-2 ring-white dark:ring-slate-800 shadow-sm ${!challenge.adminCreated ? 'cursor-pointer hover:opacity-80' : ''}`}
                    onClick={(e) => handleAvatarClick(e, challenge.challengedUser?.id)}
                  />
                  <span className="text-[9px] font-bold text-slate-500 mt-1 truncate max-w-[56px]">@{challenge.challengedUser?.username || "challenged"}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-row items-center justify-center h-10 gap-2 w-full">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if ((challenge.status !== "completed" && challenge.status !== "ended") && !hasJoined) {
                    onJoin?.({ ...challenge, selectedSide: "yes" });
                  }
                }}
                disabled={challenge.status === "completed" || challenge.status === "ended" || hasJoined}
                className={`flex items-center justify-center text-sm font-bold rounded-lg py-2 flex-1 transition-opacity ${
                  (challenge.status !== "completed" && challenge.status !== "ended") && !hasJoined
                    ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/15 dark:bg-emerald-500/20 hover:opacity-80 cursor-pointer"
                    : "text-emerald-600/40 dark:text-emerald-400/40 bg-emerald-500/5 dark:bg-emerald-500/10 cursor-not-allowed"
                }`}
                data-testid="button-challenge-yes"
              >
                Yes
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if ((challenge.status !== "completed" && challenge.status !== "ended") && !hasJoined) {
                    onJoin?.({ ...challenge, selectedSide: "no" });
                  }
                }}
                disabled={challenge.status === "completed" || challenge.status === "ended" || hasJoined}
                className={`flex items-center justify-center text-sm font-bold rounded-lg py-2 flex-1 transition-opacity ${
                  (challenge.status !== "completed" && challenge.status !== "ended") && !hasJoined
                    ? "text-red-600 dark:text-red-400 bg-red-500/15 dark:bg-red-500/20 hover:opacity-80 cursor-pointer"
                    : "text-red-600/40 dark:text-red-400/40 bg-red-500/5 dark:bg-red-500/10 cursor-not-allowed"
                }`}
                data-testid="button-challenge-no"
              >
                No
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-1 mb-1.5">
          <Badge variant="outline" className="flex flex-col items-center py-0.5 px-2 bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-700 rounded-lg h-auto min-w-[60px] shadow-sm">
            <span className="text-[8px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-tight mb-0">Stake</span>
            <span className="text-xs font-bold text-slate-900 dark:text-slate-100 leading-none">₦{(parseFloat(String(challenge.amount)) || 0).toLocaleString()}</span>
          </Badge>
          <Badge variant="outline" className="flex flex-col items-center py-0.5 px-2 bg-emerald-50/40 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-900/50 rounded-lg h-auto min-w-[60px] shadow-sm">
            <span className="text-[8px] text-emerald-600/70 dark:text-emerald-400/70 uppercase font-bold tracking-tight mb-0">Win</span>
            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 leading-none">₦{(Math.round((parseFloat(String(challenge.amount)) || 0) * 2 * (parseFloat(String(challenge.bonusMultiplier || "1.00")) || 1))).toLocaleString()}</span>
          </Badge>
        </div>

        <div className="flex items-center justify-between mt-auto pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            {/* Only show chat count for admin-created challenges */}
            {challenge.adminCreated && (
              <div className="flex items-center gap-1.5 bg-slate-100/50 dark:bg-slate-800/50 px-2 py-1 rounded-full cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                   onClick={(e) => {
                     e.stopPropagation();
                     if (onChatClick) onChatClick({ ...challenge, amount: String(challenge.amount) });
                   }}>
                <MessageCircle className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-[10px] text-slate-700 dark:text-slate-300 font-bold">
                  {challenge.commentCount ?? 0}
                </span>
              </div>
            )}

            {/* Only show participant avatars and count for admin-created challenges */}
            {challenge.adminCreated && (
              <div className="flex items-center gap-0.5 bg-slate-100/50 dark:bg-slate-800/50 px-1.5 py-1 rounded-full">
                <div className="flex items-center -space-x-1.5">
                  {/* Always show challenger if they exist */}
                  {challenge.challengerUser && (
                    <Avatar className="w-4 h-4 ring-1 ring-white dark:ring-slate-800 flex-shrink-0">
                      <AvatarImage
                        src={
                          challenge.challengerUser?.profileImageUrl ||
                          getAvatarUrl(
                            challenge.challengerUser?.id || "",
                            challenge.challengerUser?.username || challengerName,
                          )
                        }
                        alt={challengerName}
                      />
                      <AvatarFallback className="text-[8px] font-bold bg-blue-100 text-blue-700">
                        {challengerName.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  )}
                  
                  {/* Show challenged user if they exist */}
                  {challenge.challengedUser && (
                    <Avatar className="w-4 h-4 ring-1 ring-white dark:ring-slate-800 flex-shrink-0">
                      <AvatarImage
                        src={
                          challenge.challengedUser?.profileImageUrl ||
                          getAvatarUrl(
                            challenge.challengedUser?.id || "",
                            challenge.challengedUser?.username || challengedName,
                          )
                        }
                        alt={challengedName}
                      />
                      <AvatarFallback className="text-[8px] font-bold bg-green-100 text-green-700">
                        {challengedName.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  )}

                  {/* If it's an open challenge with participants in queue, show a generic avatar or count */}
                  {challenge.status === "open" && (challenge.participantCount ?? 0) > (challenge.challenger ? 1 : 0) + (challenge.challenged ? 1 : 0) && (
                    <div className="w-4 h-4 rounded-full bg-slate-200 dark:bg-slate-700 ring-1 ring-white dark:ring-slate-800 flex items-center justify-center -ml-1">
                      <span className="text-[7px] font-bold text-slate-600 dark:text-slate-400">
                        +{(challenge.participantCount ?? 0) - ((challenge.challenger ? 1 : 0) + (challenge.challenged ? 1 : 0))}
                      </span>
                    </div>
                  )}
                </div>
                <span className="text-[10px] text-slate-700 dark:text-slate-300 font-bold ml-1">
                  {challenge.participantCount ?? (challenge.challengedUser ? 2 : 1)}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1 px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded-md" title={challenge.category}>
              <CategoryIcon category={challenge.category} />
            </span>
            <span className="text-slate-300 dark:text-slate-700">•</span>
            <span className="uppercase">{getCompactTimeAgo(challenge.createdAt)}</span>
          </div>
        </div>
      </CardContent>

      {showProfileModal && selectedProfileId && (
        <ProfileCard 
          userId={selectedProfileId} 
          onClose={() => setShowProfileModal(false)}
        />
      )}

      {/* Accept Open Challenge Modal */}
      <Dialog open={showAcceptModal} onOpenChange={setShowAcceptModal}>
        <DialogContent className="sm:max-w-sm max-w-[90vw]">
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                Accept Challenge?
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                Join {challenge.challengerUser?.username || "this challenger"}'s open challenge
              </p>
            </div>

            {/* Challenge Details */}
            <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-3 space-y-2">
              <div className="flex justify-between items-start">
                <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Title:</span>
                <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 text-right">{challenge.title}</span>
              </div>
              <div className="flex justify-between items-start">
                <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Category:</span>
                <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  <CategoryIcon category={challenge.category} /> {challenge.category}
                </span>
              </div>
              <div className="flex justify-between items-start">
                <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Stake:</span>
                <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                  ₦{(parseFloat(String(challenge.amount)) || 0).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between items-start">
                <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Total Pool:</span>
                <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
                  ₦{(parseFloat(String(challenge.amount)) * 2 || 0).toLocaleString()}
                </span>
              </div>
            </div>

            {/* Info */}
            <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
              <p className="text-xs text-blue-800 dark:text-blue-300">
                ✓ Your stake will be locked on the blockchain immediately
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setShowAcceptModal(false)}
                className="flex-1"
                disabled={acceptOpenChallengeMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={() => acceptOpenChallengeMutation.mutate()}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={acceptOpenChallengeMutation.isPending}
              >
                {acceptOpenChallengeMutation.isPending ? "Accepting..." : "⚔️ Accept Challenge"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
