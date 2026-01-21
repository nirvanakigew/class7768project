import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAdminQuery, adminApiRequest } from '@/lib/adminApi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { formatDistanceToNow } from 'date-fns';
import AdminLayout from "@/components/AdminLayout";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { 
  DollarSign, 
  TrendingUp, 
  AlertCircle, 
  CheckCircle,
  Trophy,
  Users,
  Eye,
  EyeOff,
  Clock,
  Target,
  Trash2,
  Edit2,
  Zap,
  Pin
} from 'lucide-react';

interface ChallengeUser {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  profileImageUrl: string;
}

interface Challenge {
  id: number;
  challenger: string;
  challenged: string;
  title: string;
  description: string;
  category: string;
  amount: string;
  status: 'pending' | 'active' | 'completed' | 'disputed' | 'cancelled' | 'open';
  evidence: any;
  result: 'challenger_won' | 'challenged_won' | 'draw' | 'yes_won' | 'no_won' | null;
  dueDate: string;
  createdAt: string;
  completedAt: string | null;
  isPinned?: boolean;
  challengerUser: ChallengeUser;
  challengedUser: ChallengeUser;
  bonusSide: string | null;
  bonusMultiplier: string | null;
  bonusEndsAt: string | null;
  adminCreated: boolean;
  yesStakeTotal: number;
  noStakeTotal: number;
}

interface EscrowData {
  totalEscrow: number;
  status: string;
}

export default function AdminChallengePayouts() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedChallengeId, setSelectedChallengeId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createData, setCreateData] = useState({ title: '', category: '', amount: '', endDate: '', description: '' });
  const [bonusOpen, setBonusOpen] = useState(false);
  const [bonusLoading, setBonusLoading] = useState(false);
  const [bonusData, setBonusData] = useState({ challengeId: null as number | null, bonusSide: 'YES', bonusMultiplier: '1.5', durationHours: 1 });
  const [customBonusAmounts, setCustomBonusAmounts] = useState({ '1.25': '', '1.5': '', '1.75': '', '2.0': '' });
  const [payoutJobs, setPayoutJobs] = useState<{ [challengeId: number]: string }>({});
  const [deleteLoading, setDeleteLoading] = useState<number | null>(null);
  const [visibilityLoading, setVisibilityLoading] = useState<number | null>(null);

  const { data: challenges = [], isLoading, refetch } = useAdminQuery("/api/admin/challenges", {
    retry: false,
  });

  const { data: selectedEscrowData, isLoading: escrowLoading } = useQuery<EscrowData | null>({
    queryKey: ['/api/admin/challenges', selectedChallengeId, 'escrow'],
    queryFn: async () => {
      if (!selectedChallengeId) return null;
      try {
        return await adminApiRequest(`/api/admin/challenges/${selectedChallengeId}/escrow`);
      } catch {
        return null;
      }
    },
    enabled: !!selectedChallengeId,
    retry: false,
  });

  const setResultMutation = useMutation({
    mutationFn: async ({ challengeId, result }: { challengeId: number; result: string }) => {
      return adminApiRequest(`/api/admin/challenges/${challengeId}/result`, {
        method: 'POST',
        body: JSON.stringify({ result }),
      });
    },
    onSuccess: (data, variables) => {
      toast({
        title: "Challenge Resolved ✅",
        description: data.message,
      });
      
      // Track payout job if one was created
      if (data.payoutJobId) {
        setPayoutJobs(prev => ({ ...prev, [variables.challengeId]: data.payoutJobId }));
      }
      
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/challenges"] });
      if (selectedChallengeId) queryClient.invalidateQueries({ queryKey: ['/api/admin/challenges', selectedChallengeId, 'escrow'] });
      setSelectedChallengeId(null); // Clear selection after successful payout
    },
    onError: (error: Error) => {
      toast({
        title: "Payout Failed ❌",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Get result text for display
  const getResultText = (result: string | null, challenge: Challenge): string => {
    if (!result) return '';
    if (challenge.adminCreated) {
      if (result === 'yes_won') return 'YES Side Wins';
      if (result === 'no_won') return 'NO Side Wins';
    } else {
      if (result === 'challenger_won') return `${challenge.challengerUser?.username || 'Challenger'} Wins`;
      if (result === 'challenged_won') return `${challenge.challengedUser?.username || 'Challenged'} Wins`;
    }
    return 'Draw';
  };

  // Get challenge type badge
  const getChallengeTypeBadge = (challenge: Challenge) => {
    if (challenge.adminCreated) {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-500/20 text-purple-400 border border-purple-500/30">
          🏊 Admin Pool
        </span>
      );
    } else {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
          ⚔️ P2P Duel
        </span>
      );
    }
  };

  const handleSetResult = (challengeId: number, result: string) => {
    const challenge = challenges.find((c: Challenge) => c.id === challengeId);
    if (!challenge) return;

    let confirmMessage = '';
    
    if (challenge.adminCreated) {
      // Admin-created challenge - on-chain settlement
      const totalPool = challenge.yesStakeTotal + challenge.noStakeTotal;
      
      if (result === 'draw') {
        confirmMessage = `⛓️  Resolve on-chain as DRAW\n\nTotal pool: ${totalPool.toLocaleString()} coins\nAll participants get stakes refunded\n\nThis will be signed and posted to Base Sepolia blockchain.`;
      } else {
        const winnerSide = result === 'yes_won' ? 'YES' : 'NO';
        confirmMessage = `⛓️  Declare ${winnerSide} side winner on-chain\n\nTotal pool: ${totalPool.toLocaleString()} coins\nWinner pool: ${(totalPool * 0.95).toLocaleString()} coins (95% after fees)\n\nThis will be signed and posted to Base Sepolia blockchain.`;
      }
    } else {
      // P2P challenge - on-chain settlement
      const amount = parseInt(challenge.amount) || 0;
      const resultText = getResultText(result, challenge);

      if (result === 'draw') {
        confirmMessage = `⛓️  Resolve on-chain as DRAW\n\nBoth participants: ${amount.toLocaleString()} coins each refunded\n\nThis will be signed and posted to Base Sepolia blockchain.`;
      } else {
        confirmMessage = `⛓️  ${resultText} on-chain\n\nWinner receives: ${(amount * 2 * 0.95).toLocaleString()} coins (95% after fees)\nPlatform fee: ${(amount * 2 * 0.05).toLocaleString()} coins (5%)\n\nThis will be signed and posted to Base Sepolia blockchain.`;
      }
    }

    if (confirm(confirmMessage)) {
      setResultMutation.mutate({ challengeId, result });
    }
  };

  const handleDeleteChallenge = async (challengeId: number) => {
    const challenge = challenges.find((c: Challenge) => c.id === challengeId);
    if (!challenge) return;

    if (!confirm(`Delete challenge "${challenge.title}"? This action cannot be undone.`)) {
      return;
    }

    setDeleteLoading(challengeId);
    try {
      await adminApiRequest(`/api/admin/challenges/${challengeId}`, {
        method: 'DELETE',
      });
      
      toast({
        title: 'Challenge Deleted ✓',
        description: `Challenge "${challenge.title}" has been deleted`,
      });
      refetch();
    } catch (error: any) {
      toast({
        title: 'Delete Failed ✗',
        description: error.message || 'Failed to delete challenge',
        variant: 'destructive',
      });
    } finally {
      setDeleteLoading(null);
    }
  };

  const handleToggleVisibility = async (challengeId: number) => {
    const challenge = challenges.find((c: Challenge) => c.id === challengeId);
    if (!challenge) return;

    const newVisibility = !(challenge.isVisible !== false);
    setVisibilityLoading(challengeId);
    
    try {
      await adminApiRequest(`/api/admin/challenges/${challengeId}/visibility`, {
        method: 'PATCH',
        body: JSON.stringify({ isVisible: newVisibility }),
      });

      toast({
        title: `Challenge ${newVisibility ? 'Unhidden' : 'Hidden'} ✓`,
        description: `Challenge is now ${newVisibility ? 'visible' : 'hidden'} to players`,
      });
      refetch();
    } catch (error: any) {
      toast({
        title: 'Update Failed ✗',
        description: error.message || 'Failed to update challenge visibility',
        variant: 'destructive',
      });
    } finally {
      setVisibilityLoading(null);
    }
  };

  const handleTogglePin = async (challengeId: number, currentPinStatus: boolean) => {
    try {
      await adminApiRequest(`/api/admin/challenges/${challengeId}/pin`, {
        method: 'PATCH',
        body: JSON.stringify({ isPinned: !currentPinStatus }),
      });

      toast({
        title: !currentPinStatus ? 'Challenge Pinned ✓' : 'Challenge Unpinned ✓',
        description: !currentPinStatus ? 'Challenge pinned to the top' : 'Challenge unpinned',
      });
      refetch();
    } catch (error: any) {
      toast({
        title: 'Pin Toggle Failed ✗',
        description: error.message || 'Failed to toggle challenge pin status',
        variant: 'destructive',
      });
    }
  };

  const getStatusColor = (status: string, result: string | null) => {
    if (status === 'completed') return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
    if (status === 'disputed') return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300';
    if (status === 'active') return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
    if (status === 'pending') return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
    return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300';
  };

  const getResultColor = (result: string | null) => {
    if (result === 'challenger_won') return 'bg-green-600 text-white';
    if (result === 'challenged_won') return 'bg-blue-600 text-white';
    if (result === 'draw') return 'bg-gray-600 text-white';
    return 'bg-gray-400 text-gray-700';
  };

  const needsAdminAction = (challenge: Challenge) => {
    return challenge.status === 'active' && challenge.dueDate && 
           new Date(challenge.dueDate) <= new Date() && !challenge.result;
  };

  // Component to display payout progress
  const PayoutProgressDisplay = ({ jobId, challengeId }: { jobId: string; challengeId: number }) => {
    const { data: jobStatus, isLoading: jobLoading } = useQuery({
      queryKey: ['/api/admin/payout-jobs', jobId, 'status'],
      queryFn: async () => {
        try {
          return await adminApiRequest(`/api/admin/payout-jobs/${jobId}/status`, { credentials: 'include' });
        } catch (error) {
          console.error('Error fetching payout job status:', error);
          return null;
        }
      },
      refetchInterval: (jobStatus) => {
        if (!jobStatus) return 2000;  // Poll every 2 seconds initially
        if (jobStatus.status === 'completed' || jobStatus.status === 'failed') {
          return false;  // Stop polling when done
        }
        return 2000;  // Poll every 2 seconds while running
      },
      retry: false,
    });

    if (!jobStatus) return <div className="text-sm text-slate-400">Loading payout progress...</div>;

    const statusColor = {
      'queued': 'bg-yellow-500',
      'running': 'bg-blue-500',
      'completed': 'bg-green-500',
      'failed': 'bg-red-500'
    }[jobStatus.status] || 'bg-gray-500';

    return (
      <div className="space-y-2">
        <div className="flex justify-between items-center text-xs text-slate-400">
          <span>Payouts: {jobStatus.status.toUpperCase()}</span>
          <span>{jobStatus.processedWinners}/{jobStatus.totalWinners}</span>
        </div>
        <div className="w-full bg-slate-700 rounded-full h-2">
          <div 
            className={`${statusColor} h-2 rounded-full transition-all duration-300`}
            style={{ width: `${jobStatus.progressPercent}%` }}
          />
        </div>
        <div className="text-xs text-slate-400">
          {jobStatus.progressPercent}% complete
        </div>
        {jobStatus.error && (
          <div className="text-xs text-red-400 bg-red-900/20 p-2 rounded">
            Error: {jobStatus.error}
          </div>
        )}
      </div>
    );
  };

  const filteredChallenges = challenges.filter((challenge: Challenge) =>
    challenge.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    challenge.challengerUser.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
    challenge.challengedUser.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const pendingChallenges = filteredChallenges.filter((c: Challenge) => needsAdminAction(c));
  const completedChallenges = filteredChallenges.filter((c: Challenge) => c.status === 'completed');
  const activeChallenges = filteredChallenges.filter((c: Challenge) => c.status === 'active' && !needsAdminAction(c));
  const disputedChallenges = filteredChallenges.filter((c: Challenge) => c.status === 'disputed');

  const totalStaked = challenges.reduce((sum: number, c: Challenge) => 
    sum + (parseFloat(c.amount) * 2), 0); // Each challenge has 2 participants
  const totalPlatformFees = completedChallenges.reduce((sum: number, c: Challenge) => 
    sum + (parseFloat(c.amount) * 2 * 0.05), 0); // 5% platform fee

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Challenge Payouts</h1>
          <p className="text-slate-400">Manage challenge results and fund distribution</p>
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto">
          <Input
            placeholder="Search challenges..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full md:w-64 bg-slate-800 border-slate-700"
          />
          <Button className="bg-green-600" onClick={() => setShowCreateModal(true)}>Create Challenge</Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card className="bg-slate-900 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm">Pending Actions</p>
                <p className="text-2xl font-bold text-yellow-400">{pendingChallenges.length}</p>
              </div>
              <AlertCircle className="w-8 h-8 text-yellow-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm">Total Staked</p>
                <p className="text-2xl font-bold text-green-400">₦{totalStaked.toLocaleString()}</p>
              </div>
              <DollarSign className="w-8 h-8 text-green-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm">Platform Fees</p>
                <p className="text-2xl font-bold text-blue-400">₦{totalPlatformFees.toLocaleString()}</p>
              </div>
              <TrendingUp className="w-8 h-8 text-blue-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm">Completed</p>
                <p className="text-2xl font-bold text-emerald-400">{completedChallenges.length}</p>
              </div>
              <CheckCircle className="w-8 h-8 text-emerald-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm">Disputed</p>
                <p className="text-2xl font-bold text-orange-400">{disputedChallenges.length}</p>
              </div>
              <Target className="w-8 h-8 text-orange-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Challenges Needing Action */}
      {pendingChallenges.length > 0 && (
        <Card className="bg-slate-900 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center">
              <AlertCircle className="w-5 h-5 mr-2 text-yellow-400" />
              Challenges Requiring Admin Action
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {pendingChallenges.map((challenge: Challenge) => (
                <div key={challenge.id} className="bg-slate-800 rounded-lg p-4">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-semibold text-white">{challenge.title}</h3>
                        {getChallengeTypeBadge(challenge)}
                      </div>
                      <p className="text-slate-400 text-sm">
                        Due {formatDistanceToNow(new Date(challenge.dueDate), { addSuffix: true })}
                      </p>
                      <div className="flex items-center space-x-4 mt-2">
                        {challenge.adminCreated ? (
                          <>
                            <span className="text-sm text-slate-300">
                              Pool: {challenge.yesStakeTotal.toLocaleString()} YES | {challenge.noStakeTotal.toLocaleString()} NO
                            </span>
                            <span className="text-xs text-purple-400">
                              Total: {(challenge.yesStakeTotal + challenge.noStakeTotal).toLocaleString()} coins
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="text-sm text-slate-300">
                              Stake: {challenge.amount.toLocaleString()} coins each
                            </span>
                            <span className="text-sm text-cyan-400">
                              {challenge.challengerUser?.username || 'Player 1'} vs {challenge.challengedUser?.username || 'Player 2'}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {challenge.adminCreated ? (
                        <>
                          <Button
                            onClick={() => handleSetResult(challenge.id, 'yes_won')}
                            className="bg-emerald-600 hover:bg-emerald-700 text-xs"
                            disabled={setResultMutation.isPending}
                            title="Resolve YES side winner on-chain"
                          >
                            ✓ YES Wins
                          </Button>
                          <Button
                            onClick={() => handleSetResult(challenge.id, 'no_won')}
                            className="bg-rose-600 hover:bg-rose-700 text-xs"
                            disabled={setResultMutation.isPending}
                            title="Resolve NO side winner on-chain"
                          >
                            ✗ NO Wins
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            onClick={() => handleSetResult(challenge.id, 'challenger_won')}
                            className="bg-cyan-600 hover:bg-cyan-700 text-xs"
                            disabled={setResultMutation.isPending}
                            title="Resolve on-chain with crypto settlement"
                          >
                            {challenge.challengerUser?.username || 'Player 1'} Wins
                          </Button>
                          <Button
                            onClick={() => handleSetResult(challenge.id, 'challenged_won')}
                            className="bg-indigo-600 hover:bg-indigo-700 text-xs"
                            disabled={setResultMutation.isPending}
                            title="Resolve on-chain with crypto settlement"
                          >
                            {challenge.challengedUser?.username || 'Player 2'} Wins
                          </Button>
                        </>
                      )}
                      <Button
                        onClick={() => handleSetResult(challenge.id, 'draw')}
                        className="bg-gray-600 hover:bg-gray-700 text-xs"
                        disabled={setResultMutation.isPending}
                        title="Refund both participants on-chain"
                      >
                        🤝 Draw
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setSelectedChallengeId(challenge.id)}
                        className="border-slate-600 text-xs"
                        title="View transaction details"
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* All Challenges */}
      <Card className="bg-slate-900 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white">All Challenges</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left p-3 text-slate-400">Type</th>
                  <th className="text-left p-3 text-slate-400">Challenge</th>
                  <th className="text-left p-3 text-slate-400">Participants/Pool</th>
                  <th className="text-left p-3 text-slate-400">Status</th>
                  <th className="text-left p-3 text-slate-400">Settlement</th>
                  <th className="text-left p-3 text-slate-400">Result</th>
                  <th className="text-left p-3 text-slate-400">Due</th>
                  <th className="text-left p-3 text-slate-400">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredChallenges.map((challenge: Challenge) => (
                  <React.Fragment key={challenge.id}>
                    <tr className="border-b border-slate-800 hover:bg-slate-800">
                      <td className="p-3">
                        {getChallengeTypeBadge(challenge)}
                      </td>
                      <td className="p-3">
                        <div className="font-medium text-white text-sm">{challenge.title}</div>
                        <div className="text-xs text-slate-400">{challenge.category}</div>
                      </td>
                      <td className="p-3 text-slate-300 text-xs">
                        {challenge.adminCreated ? (
                          <div>
                            <div>YES: {challenge.yesStakeTotal.toLocaleString()}</div>
                            <div>NO: {challenge.noStakeTotal.toLocaleString()}</div>
                          </div>
                        ) : (
                          <div className="flex items-center space-x-2">
                            <Users className="w-3 h-3" />
                            <span>
                              {challenge.challengerUser?.username || 'P1'} vs {challenge.challengedUser?.username || 'P2'}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="p-3">
                        <Badge className={getStatusColor(challenge.status, challenge.result)}>
                          {challenge.status}
                        </Badge>
                      </td>
                      <td className="p-3 text-xs">
                        {challenge.onChainStatus === 'resolved' ? (
                          <Badge className="bg-emerald-600/30 text-emerald-300 font-mono text-xs">
                            ⛓️ On-Chain
                          </Badge>
                        ) : challenge.status === 'completed' ? (
                          <Badge className="bg-blue-600/30 text-blue-300">
                            Pending Settlement
                          </Badge>
                        ) : (
                          <Badge className="bg-gray-600/30 text-gray-300">
                            Awaiting Result
                          </Badge>
                        )}
                      </td>
                      <td className="p-3">
                        {challenge.result ? (
                          <Badge className={getResultColor(challenge.result)} title={`Result: ${challenge.result}`}>
                            {getResultText(challenge.result, challenge).split(' ')[0]}
                          </Badge>
                        ) : (
                          <span className="text-slate-500 text-xs">-</span>
                        )}
                      </td>
                      <td className="p-3 text-slate-400 text-xs">
                        {challenge.dueDate ? (
                          formatDistanceToNow(new Date(challenge.dueDate), { addSuffix: false })
                        ) : (
                          <span className="text-slate-500">-</span>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="flex gap-1 flex-wrap">
                          {needsAdminAction(challenge) && (
                            <>
                              {challenge.adminCreated ? (
                                <>
                                  <Button
                                    size="sm"
                                    onClick={() => handleSetResult(challenge.id, 'yes_won')}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-xs"
                                    title="YES side wins - on-chain settlement"
                                  >
                                    ✓ YES
                                  </Button>
                                  <Button
                                    size="sm"
                                    onClick={() => handleSetResult(challenge.id, 'no_won')}
                                    className="bg-rose-600 hover:bg-rose-700 text-xs"
                                    title="NO side wins - on-chain settlement"
                                  >
                                    ✗ NO
                                  </Button>
                                </>
                              ) : (
                                <>
                                  <Button
                                    size="sm"
                                    onClick={() => handleSetResult(challenge.id, 'challenger_won')}
                                    className="bg-cyan-600 hover:bg-cyan-700 text-xs"
                                    title="Resolve on-chain"
                                  >
                                    P1
                                  </Button>
                                  <Button
                                    size="sm"
                                    onClick={() => handleSetResult(challenge.id, 'challenged_won')}
                                    className="bg-indigo-600 hover:bg-indigo-700 text-xs"
                                    title="Resolve on-chain"
                                  >
                                    P2
                                  </Button>
                                </>
                              )}
                              <Button
                                size="sm"
                                onClick={() => handleSetResult(challenge.id, 'draw')}
                                className="bg-gray-600 hover:bg-gray-700 text-xs"
                                title="Draw - refund on-chain"
                              >
                                =
                              </Button>
                            </>
                          )}
                          {challenge.onChainStatus === 'resolved' && (
                            <Button
                              size="sm"
                              className="bg-emerald-700 text-white text-xs pointer-events-none"
                              title="Resolved on Base Sepolia"
                            >
                              ⛓️ Settled
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedChallengeId(challenge.id)}
                            className="border-slate-600 text-xs hover:bg-slate-700"
                            title="View blockchain transaction"
                          >
                            <Eye className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleToggleVisibility(challenge.id)}
                            disabled={visibilityLoading === challenge.id}
                            className="border-slate-600 text-xs hover:bg-slate-700"
                            title={challenge.isVisible !== false ? "Hide" : "Unhide"}
                          >
                            {challenge.isVisible !== false ? (
                              <EyeOff className="w-3 h-3" />
                            ) : (
                              <Eye className="w-3 h-3" />
                            )}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleTogglePin(challenge.id, challenge.isPinned || false)}
                            className={`text-xs ${challenge.isPinned ? 'bg-yellow-600 text-white border-yellow-600' : 'border-slate-600'}`}
                            title={challenge.isPinned ? "Unpin from top" : "Pin to top"}
                          >
                            <Pin className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteChallenge(challenge.id)}
                            disabled={deleteLoading === challenge.id}
                            className="border-red-600 text-red-400 hover:bg-red-900/30 text-xs"
                            title="Delete Challenge"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                    {payoutJobs[challenge.id] && (
                      <tr className="border-b border-slate-800 bg-slate-800/50">
                        <td colSpan={7} className="p-4">
                          <PayoutProgressDisplay jobId={payoutJobs[challenge.id]} challengeId={challenge.id} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Create Challenge Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="bg-slate-800 border-slate-700 max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-white">Create Admin Challenge</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-slate-300">Title</label>
              <Input value={createData.title} onChange={(e) => setCreateData(d => ({ ...d, title: e.target.value }))} className="bg-slate-700" />
            </div>

            <div>
              <label className="block text-sm text-slate-300">Category</label>
              <Input value={createData.category} onChange={(e) => setCreateData(d => ({ ...d, category: e.target.value }))} className="bg-slate-700" />
            </div>

            <div>
              <label className="block text-sm text-slate-300">Amount (₦)</label>
              <Input type="number" value={createData.amount} onChange={(e) => setCreateData(d => ({ ...d, amount: e.target.value }))} className="bg-slate-700" />
            </div>

            <div>
              <label className="block text-sm text-slate-300">End Date (optional)</label>
              <Input type="datetime-local" value={createData.endDate} onChange={(e) => setCreateData(d => ({ ...d, endDate: e.target.value }))} className="bg-slate-700" />
            </div>

            <div>
              <label className="block text-sm text-slate-300">Description</label>
              <Textarea value={createData.description} onChange={(e) => setCreateData(d => ({ ...d, description: e.target.value }))} className="bg-slate-700" />
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowCreateModal(false)} className="border-slate-600">Cancel</Button>
              <Button className="bg-blue-600" disabled={createLoading} onClick={async () => {
                try {
                  setCreateLoading(true);
                  const created = await adminApiRequest('/api/admin/challenges', {
                    method: 'POST',
                    body: JSON.stringify({
                      title: createData.title,
                      category: createData.category,
                      amount: createData.amount,
                      endDate: createData.endDate,
                      description: createData.description,
                    }),
                  });
                  toast({ title: 'Challenge Created', description: `ID: ${created.id}` });
                  setShowCreateModal(false);
                  setCreateData({ title: '', category: '', amount: '', endDate: '', description: '' });
                  queryClient.invalidateQueries({ queryKey: ['/api/admin/challenges'] });
                } catch (err: any) {
                  toast({ title: 'Error', description: err.message || 'Failed to create challenge', variant: 'destructive' });
                } finally {
                  setCreateLoading(false);
                }
              }}>Create</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Challenge Details Dialog */}
      <Dialog open={!!selectedChallengeId} onOpenChange={(open) => !open && setSelectedChallengeId(null)}>
        <DialogContent className="bg-slate-800 border-slate-700 max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white text-xl">Challenge Details</DialogTitle>
          </DialogHeader>
          {(() => {
            const challenge = challenges.find((c: Challenge) => c.id === selectedChallengeId);
            if (!challenge) return <p className="text-slate-400">Loading...</p>;
            const stakeAmount = parseFloat(challenge.amount);
            const estimatedEscrow = stakeAmount * 2;
            const hasRealData = selectedEscrowData !== null && selectedEscrowData !== undefined;
            const totalEscrow = hasRealData ? selectedEscrowData.totalEscrow : estimatedEscrow;
            const platformFee = totalEscrow * 0.05;
            const winnerPayout = totalEscrow - platformFee;
            const escrowStatus = selectedEscrowData?.status || (challenge.status === 'completed' ? 'released' : 'holding');
            const hasBonusActive = challenge.bonusEndsAt && new Date(challenge.bonusEndsAt) > new Date();

            return (
              <div className="space-y-6">
                {/* Challenge Info */}
                <div className="bg-slate-700/50 rounded-lg p-4">
                  <h3 className="font-semibold text-white text-lg mb-2">{challenge.title}</h3>
                  <p className="text-slate-400 text-sm mb-3">{challenge.description || 'No description'}</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div>
                      <span className="text-slate-400">Category:</span>
                      <span className="ml-1 text-white">{challenge.category}</span>
                    </div>
                    <div>
                      <span className="text-slate-400">Status:</span>
                      <Badge className={`ml-1 ${getStatusColor(challenge.status, challenge.result)}`}>{challenge.status}</Badge>
                    </div>
                    <div>
                      <span className="text-slate-400">Created:</span>
                      <span className="ml-1 text-white">{new Date(challenge.createdAt).toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-slate-400">Due:</span>
                      <span className="ml-1 text-white">{challenge.dueDate ? new Date(challenge.dueDate).toLocaleString() : 'No deadline'}</span>
                    </div>
                  </div>
                </div>

                {/* Matched Players */}
                <div className="bg-slate-700/50 rounded-lg p-4">
                  <h4 className="text-white font-semibold mb-3 flex items-center gap-2">
                    <Users className="w-4 h-4" /> Matched Players
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Challenger */}
                    <div className="bg-slate-800 rounded-lg p-3 border border-green-600/30">
                      <div className="flex items-center gap-3">
                        <img 
                          src={challenge.challengerUser?.profileImageUrl || '/placeholder-avatar.png'} 
                          alt="Challenger"
                          className="w-12 h-12 rounded-full border-2 border-green-500"
                          onError={(e) => (e.currentTarget.src = '/placeholder-avatar.png')}
                        />
                        <div className="flex-1">
                          <div className="text-green-400 text-xs font-semibold">CHALLENGER (YES)</div>
                          <div className="text-white font-medium">{challenge.challengerUser?.username || challenge.challengerUser?.firstName || 'Unknown'}</div>
                          <div className="text-slate-400 text-xs">{challenge.challengerUser?.firstName} {challenge.challengerUser?.lastName}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-slate-400 text-xs">Stake</div>
                          <div className="text-green-400 font-bold">₦{stakeAmount.toLocaleString()}</div>
                        </div>
                      </div>
                      {challenge.result === 'challenger_won' && (
                        <div className="mt-2 text-center py-1 bg-green-600/20 rounded text-green-400 text-sm font-semibold">
                          <Trophy className="w-4 h-4 inline mr-1" /> WINNER
                        </div>
                      )}
                    </div>

                    {/* Challenged */}
                    <div className="bg-slate-800 rounded-lg p-3 border border-blue-600/30">
                      <div className="flex items-center gap-3">
                        <img 
                          src={challenge.challengedUser?.profileImageUrl || '/placeholder-avatar.png'} 
                          alt="Challenged"
                          className="w-12 h-12 rounded-full border-2 border-blue-500"
                          onError={(e) => (e.currentTarget.src = '/placeholder-avatar.png')}
                        />
                        <div className="flex-1">
                          <div className="text-blue-400 text-xs font-semibold">CHALLENGED (NO)</div>
                          <div className="text-white font-medium">{challenge.challengedUser?.username || challenge.challengedUser?.firstName || 'Unknown'}</div>
                          <div className="text-slate-400 text-xs">{challenge.challengedUser?.firstName} {challenge.challengedUser?.lastName}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-slate-400 text-xs">Stake</div>
                          <div className="text-blue-400 font-bold">₦{stakeAmount.toLocaleString()}</div>
                        </div>
                      </div>
                      {challenge.result === 'challenged_won' && (
                        <div className="mt-2 text-center py-1 bg-blue-600/20 rounded text-blue-400 text-sm font-semibold">
                          <Trophy className="w-4 h-4 inline mr-1" /> WINNER
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Escrow & Payout Info */}
                <div className="bg-slate-700/50 rounded-lg p-4">
                  <h4 className="text-white font-semibold mb-3 flex items-center gap-2">
                    <DollarSign className="w-4 h-4" /> Escrow & Payout
                    {hasRealData && <Badge className="bg-green-600/30 text-green-400 text-xs ml-2">Live Data</Badge>}
                    {!hasRealData && !escrowLoading && <Badge className="bg-yellow-600/30 text-yellow-400 text-xs ml-2">Estimated</Badge>}
                  </h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-slate-800 p-3 rounded-lg text-center">
                      <div className="text-slate-400 text-xs">Total Escrow</div>
                      {escrowLoading ? (
                        <div className="animate-pulse h-6 bg-slate-600 rounded mt-1"></div>
                      ) : (
                        <div className="text-white font-bold text-lg">₦{totalEscrow.toLocaleString()}</div>
                      )}
                    </div>
                    <div className="bg-slate-800 p-3 rounded-lg text-center">
                      <div className="text-slate-400 text-xs">Platform Fee (5%)</div>
                      <div className="text-yellow-400 font-bold text-lg">₦{platformFee.toLocaleString()}</div>
                    </div>
                    <div className="bg-slate-800 p-3 rounded-lg text-center">
                      <div className="text-slate-400 text-xs">Winner Payout</div>
                      <div className="text-green-400 font-bold text-lg">₦{winnerPayout.toLocaleString()}</div>
                    </div>
                    <div className="bg-slate-800 p-3 rounded-lg text-center">
                      <div className="text-slate-400 text-xs">Escrow Status</div>
                      {escrowLoading ? (
                        <div className="animate-pulse h-6 bg-slate-600 rounded mt-1"></div>
                      ) : (
                        <div className={`font-bold text-lg capitalize ${escrowStatus === 'released' ? 'text-green-400' : 'text-blue-400'}`}>
                          {escrowStatus}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Bonus Section */}
                <div className="bg-slate-700/50 rounded-lg p-4">
                  <h4 className="text-white font-semibold mb-3 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" /> Bonus Multiplier
                  </h4>
                  {hasBonusActive ? (
                    <div className="bg-purple-600/20 border border-purple-500/30 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-purple-400 font-semibold">Active Bonus: </span>
                          <span className="text-white">{challenge.bonusMultiplier}x on {challenge.bonusSide} side</span>
                        </div>
                        <Badge className="bg-purple-600">
                          Ends {formatDistanceToNow(new Date(challenge.bonusEndsAt!), { addSuffix: true })}
                        </Badge>
                      </div>
                    </div>
                  ) : challenge.status === 'active' ? (
                    <div className="space-y-3">
                      <p className="text-slate-400 text-sm">Activate a bonus multiplier to incentivize one side</p>
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="text-slate-400 text-xs">Side</label>
                          <select 
                            value={bonusData.bonusSide} 
                            onChange={(e) => setBonusData(d => ({ ...d, bonusSide: e.target.value }))}
                            className="w-full bg-slate-700 border border-slate-600 rounded p-2 text-white"
                          >
                            <option value="YES">YES (Challenger)</option>
                            <option value="NO">NO (Challenged)</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-slate-400 text-xs">Multiplier</label>
                          <select 
                            value={bonusData.bonusMultiplier} 
                            onChange={(e) => setBonusData(d => ({ ...d, bonusMultiplier: e.target.value }))}
                            className="w-full bg-slate-700 border border-slate-600 rounded p-2 text-white"
                          >
                            <option value="1.25">1.25x</option>
                            <option value="1.5">1.5x</option>
                            <option value="1.75">1.75x</option>
                            <option value="2.0">2.0x</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-slate-400 text-xs">Duration</label>
                          <select 
                            value={bonusData.durationHours} 
                            onChange={(e) => setBonusData(d => ({ ...d, durationHours: parseInt(e.target.value) }))}
                            className="w-full bg-slate-700 border border-slate-600 rounded p-2 text-white"
                          >
                            <option value="1">1 hour</option>
                            <option value="2">2 hours</option>
                            <option value="6">6 hours</option>
                            <option value="12">12 hours</option>
                            <option value="24">24 hours</option>
                          </select>
                        </div>
                      </div>
                      <Button 
                        className="bg-purple-600 hover:bg-purple-700" 
                        disabled={bonusLoading}
                        onClick={async () => {
                          try {
                            setBonusLoading(true);
                            await adminApiRequest('/api/admin/challenges/bonus', {
                              method: 'POST',
                              credentials: 'include',
                              body: JSON.stringify({
                                challengeId: selectedChallengeId,
                                bonusSide: bonusData.bonusSide,
                                bonusMultiplier: bonusData.bonusMultiplier,
                                durationHours: bonusData.durationHours,
                              }),
                            });
                            toast({ title: 'Bonus Activated', description: `${bonusData.bonusMultiplier}x multiplier on ${bonusData.bonusSide} side` });
                            queryClient.invalidateQueries({ queryKey: ['/api/admin/challenges'] });
                          } catch (err: any) {
                            toast({ title: 'Error', description: err.message, variant: 'destructive' });
                          } finally {
                            setBonusLoading(false);
                          }
                        }}
                      >
                        {bonusLoading ? 'Activating...' : 'Activate Bonus'}
                      </Button>
                    </div>
                  ) : (
                    <p className="text-slate-400 text-sm">No bonus active. Bonuses can only be set on active challenges.</p>
                  )}
                </div>

                {/* Actions */}
                {challenge.status === 'active' && !challenge.result && (
                  <div className="bg-slate-700/50 rounded-lg p-4">
                    <h4 className="text-white font-semibold mb-3 flex items-center gap-2">
                      <Zap className="w-4 h-4" /> On-Chain Settlement
                    </h4>
                    <p className="text-slate-400 text-sm mb-3">Select the outcome to resolve this challenge on Base Sepolia blockchain</p>
                    <div className="flex flex-wrap gap-2">
                      {challenge.adminCreated ? (
                        <>
                          <Button
                            onClick={() => handleSetResult(challenge.id, 'yes_won')}
                            className="bg-emerald-600 hover:bg-emerald-700"
                            disabled={setResultMutation.isPending}
                            title="Settle YES side winner on blockchain"
                          >
                            <Zap className="w-4 h-4 mr-2" />
                            ✓ YES Side Wins
                          </Button>
                          <Button
                            onClick={() => handleSetResult(challenge.id, 'no_won')}
                            className="bg-rose-600 hover:bg-rose-700"
                            disabled={setResultMutation.isPending}
                            title="Settle NO side winner on blockchain"
                          >
                            <Zap className="w-4 h-4 mr-2" />
                            ✗ NO Side Wins
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            onClick={() => handleSetResult(challenge.id, 'challenger_won')}
                            className="bg-cyan-600 hover:bg-cyan-700"
                            disabled={setResultMutation.isPending}
                            title="Settle on-chain to challenger"
                          >
                            <Zap className="w-4 h-4 mr-2" />
                            {challenge.challengerUser?.username || 'Challenger'} Wins
                          </Button>
                          <Button
                            onClick={() => handleSetResult(challenge.id, 'challenged_won')}
                            className="bg-indigo-600 hover:bg-indigo-700"
                            disabled={setResultMutation.isPending}
                            title="Settle on-chain to challenged"
                          >
                            <Zap className="w-4 h-4 mr-2" />
                            {challenge.challengedUser?.username || 'Challenged'} Wins
                          </Button>
                        </>
                      )}
                      <Button
                        onClick={() => handleSetResult(challenge.id, 'draw')}
                        variant="secondary"
                        disabled={setResultMutation.isPending}
                        title="Refund both participants on-chain"
                      >
                        🤝 Draw (Refund on-chain)
                      </Button>
                    </div>
                  </div>
                )}

                {/* Completed Result */}
                {challenge.result && (
                  <div className={`rounded-lg p-4 border ${challenge.onChainStatus === 'resolved' ? 'bg-emerald-600/10 border-emerald-500/30' : 'bg-blue-600/10 border-blue-500/30'}`}>
                    <h4 className={`${challenge.onChainStatus === 'resolved' ? 'text-emerald-400' : 'text-blue-400'} font-semibold mb-3 flex items-center gap-2`}>
                      {challenge.onChainStatus === 'resolved' ? (
                        <>
                          <CheckCircle className="w-5 h-5" />
                          Challenge Settled On-Chain
                        </>
                      ) : (
                        <>
                          <AlertCircle className="w-5 h-5" />
                          Result Set (Pending On-Chain Settlement)
                        </>
                      )}
                    </h4>
                    <div className="space-y-2 text-sm">
                      <p className="text-white">
                        Result: <strong>{getResultText(challenge.result, challenge)}</strong>
                      </p>
                      {challenge.completedAt && (
                        <p className="text-slate-400">
                          Decided: {new Date(challenge.completedAt).toLocaleString()}
                        </p>
                      )}
                      {challenge.onChainStatus === 'resolved' && challenge.blockchainResolutionTxHash && (
                        <div className="bg-slate-900/50 rounded p-2 mt-2 space-y-1">
                          <p className="text-slate-400 text-xs">⛓️ Blockchain Settlement</p>
                          <a 
                            href={`https://sepolia.basescan.org/tx/${challenge.blockchainResolutionTxHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-cyan-400 hover:text-cyan-300 text-xs break-all"
                            title="View on Base Sepolia"
                          >
                            {challenge.blockchainResolutionTxHash.slice(0, 20)}...{challenge.blockchainResolutionTxHash.slice(-20)}
                          </a>
                          <p className="text-xs text-slate-500">Network: Base Sepolia</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Bonus Modal */}
      <Dialog open={bonusOpen} onOpenChange={setBonusOpen}>
        <DialogContent className="bg-slate-800 border-slate-700 max-w-sm p-4">
          <DialogHeader className="pb-2">
            <DialogTitle className="text-white flex items-center gap-2 text-base">
              <Zap className="w-4 h-4 text-purple-400" />
              Bonus Multiplier
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <div>
              <label className="block text-xs text-slate-300 mb-1 font-medium">Bonus Side</label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant={bonusData.bonusSide === 'YES' ? 'default' : 'outline'}
                  onClick={() => setBonusData(d => ({ ...d, bonusSide: 'YES' }))}
                  className={`${bonusData.bonusSide === 'YES' ? 'bg-green-600' : 'border-slate-600'} text-xs h-8`}
                >
                  YES (Challenger)
                </Button>
                <Button
                  variant={bonusData.bonusSide === 'NO' ? 'default' : 'outline'}
                  onClick={() => setBonusData(d => ({ ...d, bonusSide: 'NO' }))}
                  className={`${bonusData.bonusSide === 'NO' ? 'bg-blue-600' : 'border-slate-600'} text-xs h-8`}
                >
                  NO (Challenged)
                </Button>
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-300 mb-1 font-medium">Multiplier & Amount</label>
              <div className="grid grid-cols-2 gap-2">
                {['1.25', '1.5', '1.75', '2.0'].map(mult => (
                  <div key={mult} className="space-y-1">
                    <Button
                      variant={bonusData.bonusMultiplier === mult ? 'default' : 'outline'}
                      onClick={() => setBonusData(d => ({ ...d, bonusMultiplier: mult }))}
                      className={`w-full ${bonusData.bonusMultiplier === mult ? 'bg-purple-600' : 'border-slate-600'} text-xs h-7 p-0`}
                    >
                      {mult}x
                    </Button>
                    <div className="flex items-center gap-0.5">
                      <span className="text-xs text-slate-400">₦</span>
                      <Input
                        type="number"
                        placeholder="0"
                        value={customBonusAmounts[mult as keyof typeof customBonusAmounts]}
                        onChange={(e) => setCustomBonusAmounts(prev => ({ ...prev, [mult]: e.target.value }))}
                        className="h-6 text-xs bg-slate-700 border-slate-600 p-1"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-300 mb-1 font-medium">Duration</label>
              <div className="bg-slate-700/50 p-2 rounded text-xs text-slate-300">
                <p className="font-medium">{challenges.find(c => c.id === bonusData.challengeId) ? new Date(challenges.find(c => c.id === bonusData.challengeId)!.dueDate).toLocaleDateString() : 'N/A'}</p>
                <p className="text-xs text-slate-400">Until challenge ends</p>
              </div>
            </div>

            <div className="bg-slate-700/50 p-2 rounded text-xs text-slate-300">
              {(() => {
                const customAmount = parseInt(customBonusAmounts[bonusData.bonusMultiplier as keyof typeof customBonusAmounts] || '0');
                return (
                  <>
                    <p><strong>Effect:</strong> {bonusData.bonusMultiplier}x on <span className={bonusData.bonusSide === 'YES' ? 'text-green-400' : 'text-blue-400'}>{bonusData.bonusSide}</span> side</p>
                    <p className="text-xs mt-0.5">Amount: ₦{customAmount.toLocaleString() || '0'}</p>
                  </>
                );
              })()}
            </div>

            <div className="flex gap-2 pt-1">
              <Button variant="outline" onClick={() => setBonusOpen(false)} className="border-slate-600 text-xs h-8 flex-1">
                Cancel
              </Button>
              {challenges.find(c => c.id === bonusData.challengeId)?.bonusEndsAt && new Date(challenges.find(c => c.id === bonusData.challengeId)?.bonusEndsAt || 0) > new Date() && (
                <Button
                  variant="destructive"
                  disabled={bonusLoading}
                    onClick={async () => {
                      try {
                        setBonusLoading(true);
                        await adminApiRequest('/api/admin/challenges/bonus', {
                          method: 'DELETE',
                          credentials: 'include',
                          body: JSON.stringify({ challengeId: bonusData.challengeId }),
                        });
                        toast({ title: '✅ Bonus Removed', description: 'The bonus has been cancelled' });
                        queryClient.invalidateQueries({ queryKey: ['/api/admin/challenges'] });
                        setBonusOpen(false);
                      } catch (err: any) {
                        toast({ title: '❌ Error', description: err.message, variant: 'destructive' });
                      } finally {
                        setBonusLoading(false);
                      }
                    }}
                  className="text-xs h-8"
                >
                  {bonusLoading ? 'Removing...' : 'Remove'}
                </Button>
              )}
              <Button
                className="bg-purple-600 hover:bg-purple-700 text-xs h-8 flex-1"
                disabled={bonusLoading || !bonusData.challengeId}
                onClick={async () => {
                  try {
                    setBonusLoading(true);
                    const challenge = challenges.find(c => c.id === bonusData.challengeId);
                    const dueDate = challenge ? new Date(challenge.dueDate) : new Date();
                    const now = new Date();
                    const durationHours = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60));
                    const customAmount = parseInt(customBonusAmounts[bonusData.bonusMultiplier as keyof typeof customBonusAmounts] || '0');
                    
                    await adminApiRequest('/api/admin/challenges/bonus', {
                      method: 'POST',
                      credentials: 'include',
                      body: JSON.stringify({
                        challengeId: bonusData.challengeId,
                        bonusSide: bonusData.bonusSide,
                        bonusMultiplier: bonusData.bonusMultiplier,
                        durationHours: Math.max(1, durationHours),
                        bonusAmount: customAmount,
                      }),
                    });
                    toast({ title: '✅ Bonus Activated', description: `${bonusData.bonusMultiplier}x (₦${customAmount.toLocaleString()}) on ${bonusData.bonusSide} side until challenge ends` });
                    queryClient.invalidateQueries({ queryKey: ['/api/admin/challenges'] });
                    setBonusOpen(false);
                  } catch (err: any) {
                    toast({ title: '❌ Error', description: err.message, variant: 'destructive' });
                  } finally {
                    setBonusLoading(false);
                  }
                }}
              >
                {bonusLoading ? 'Activating...' : 'Activate'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      </div>
    </AdminLayout>
  );
}