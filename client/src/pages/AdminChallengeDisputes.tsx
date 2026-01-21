import { useState } from 'react';
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
  AlertTriangle,
  MessageSquare,
  UserCheck,
  UserX,
  Eye,
  Clock,
  Scale
} from 'lucide-react';

interface DisputedChallenge {
  id: number;
  title: string;
  description: string;
  category: string;
  amount: string;
  status: 'disputed' | 'pending_resolution' | 'resolved';
  evidence: any;
  result: 'challenger_won' | 'challenged_won' | 'draw' | null;
  dueDate: string;
  createdAt: string;
  completedAt: string | null;
  challengerUser: {
    id: string;
    username: string;
    firstName: string;
    profileImageUrl: string;
  };
  challengedUser: {
    id: string;
    username: string;
    firstName: string;
    profileImageUrl: string;
  };
  disputer: {
    id: string;
    username: string;
  };
  disputeReason: string;
  disputeEvidence: any;
  dispuedAt: string;
  adminNotes: string | null;
}

export default function AdminChallengeDisputes() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedDispute, setSelectedDispute] = useState<DisputedChallenge | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [adminNotes, setAdminNotes] = useState('');

  // Fetch disputed challenges requiring admin resolution
  const { data: disputes = [], isLoading, refetch } = useQuery({
    queryKey: ["/api/admin/challenges/disputes/list"],
    queryFn: async () => {
      try {
        const response = await adminApiRequest('/api/admin/challenges/disputes/list', { credentials: 'include' });
        return response.disputes || [];
      } catch (error) {
        console.error("Error fetching disputes:", error);
        toast({
          title: "❌ Failed to load disputes",
          description: String(error),
          variant: "destructive",
        });
        return [];
      }
    },
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  // Fetch pending_admin challenges that need resolution
  const { data: pendingChallenges = [], isLoading: pendingLoading } = useQuery({
    queryKey: ["/api/admin/challenges/pending"],
    queryFn: async () => {
      try {
        return await adminApiRequest('/api/admin/challenges/pending', { credentials: 'include' });
      } catch (error) {
        console.error("Error fetching pending challenges:", error);
        return [];
      }
    },
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  const resolveMutation = useMutation({
    mutationFn: async ({ 
      challengeId, 
      decision, 
      notes 
    }: { 
      challengeId: number; 
      decision: 'challenger_won' | 'challenged_won' | 'draw'; 
      notes: string;
    }) => {
      return adminApiRequest(`/api/admin/challenges/${challengeId}/resolve-dispute`, {
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ decision, adminNotes: notes }),
      });
    },
    onSuccess: (data) => {
      toast({
        title: "✅ Dispute Resolved On-Chain",
        description: `⛓️ Base Sepolia TX: ${data.transactionHash?.slice(0, 10)}...`,
      });
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/challenges/disputes/list"] });
      setSelectedDispute(null);
      setAdminNotes('');
    },
    onError: (error: Error) => {
      toast({
        title: "❌ Resolution Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const filteredDisputes = disputes.filter((dispute: DisputedChallenge) => {
    if (filterStatus !== 'all' && dispute.status !== filterStatus) return false;
    if (searchQuery) {
      const s = searchQuery.toLowerCase();
      return (
        dispute.title.toLowerCase().includes(s) ||
        dispute.challengerUser.username.toLowerCase().includes(s) ||
        dispute.challengedUser.username.toLowerCase().includes(s) ||
        dispute.disputer.username.toLowerCase().includes(s)
      );
    }
    return true;
  });

  const handleResolve = (dispute: DisputedChallenge, decision: 'challenger_won' | 'challenged_won' | 'draw') => {
    const confirmMsg = 
      decision === 'challenger_won' ? `Award dispute to ${dispute.challenger} + on-chain settlement?` :
      decision === 'challenged_won' ? `Award dispute to ${dispute.challenged} + on-chain settlement?` :
      `Refund both participants on-chain?`;

    if (confirm(`⛓️  ${confirmMsg}`)) {
      resolveMutation.mutate({
        challengeId: dispute.id,
        decision,
        notes: adminNotes,
      });
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white">Challenge Disputes & Resolutions</h1>
            <p className="text-slate-400">Review and resolve disputed challenges, and manage challenges awaiting resolution</p>
          </div>
        </div>

        {/* Pending Resolution Challenges Section */}
        {pendingChallenges.length > 0 && (
          <Card className="bg-gradient-to-r from-yellow-900 to-orange-900 border-yellow-700">
            <CardHeader>
              <CardTitle className="text-yellow-200 flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Challenges Awaiting Resolution ({pendingChallenges.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {pendingChallenges.map((challenge: any) => (
                <div key={challenge.id} className="bg-slate-800 p-3 rounded border border-yellow-700">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <h3 className="text-white font-semibold">{challenge.title}</h3>
                      <p className="text-sm text-slate-400 mt-1">
                        Due Date: {challenge.dueDate ? new Date(challenge.dueDate).toLocaleDateString() : 'Not set'}
                      </p>
                      {challenge.challenger && challenge.challenged && (
                        <p className="text-sm text-slate-400">
                          {challenge.challenger.substring(0, 8)}... vs {challenge.challenged.substring(0, 8)}...
                        </p>
                      )}
                    </div>
                    <Button
                      onClick={() => {
                        // Navigate to resolution
                        window.location.href = `/admin/challenges/disputes#${challenge.id}`;
                      }}
                      className="bg-yellow-600 hover:bg-yellow-700"
                      size="sm"
                    >
                      Resolve
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-slate-900 border-slate-700">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm">Awaiting Resolution</p>
                  <p className="text-2xl font-bold text-yellow-400">{pendingChallenges.length}</p>
                </div>
                <Clock className="w-8 h-8 text-yellow-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-700">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm">Total Disputes</p>
                  <p className="text-2xl font-bold text-red-400">{disputes.length}</p>
                </div>
                <AlertTriangle className="w-8 h-8 text-red-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-700">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm">Disputed</p>
                  <p className="text-2xl font-bold text-orange-400">
                    {disputes.filter((d: DisputedChallenge) => d.status === 'disputed').length}
                  </p>
                </div>
                <Clock className="w-8 h-8 text-orange-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-700">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm">Pending Resolution</p>
                  <p className="text-2xl font-bold text-yellow-400">
                    {disputes.filter((d: DisputedChallenge) => d.status === 'pending_resolution').length}
                  </p>
                </div>
                <Scale className="w-8 h-8 text-yellow-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-700">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm">Resolved</p>
                  <p className="text-2xl font-bold text-green-400">
                    {disputes.filter((d: DisputedChallenge) => d.status === 'resolved').length}
                  </p>
                </div>
                <UserCheck className="w-8 h-8 text-green-400" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex gap-2 flex-wrap items-center">
          <Input
            placeholder="Search by title, user, or disputer..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full md:w-96 bg-slate-800 border-slate-700"
          />
          <select 
            value={filterStatus} 
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-white p-2 rounded"
          >
            <option value="all">All Statuses</option>
            <option value="disputed">Disputed</option>
            <option value="pending_resolution">Pending</option>
            <option value="resolved">Resolved</option>
          </select>
        </div>

        {/* Disputes List */}
        {isLoading ? (
          <div className="flex justify-center items-center h-96">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : filteredDisputes.length === 0 ? (
          <Card className="bg-slate-900 border-slate-700">
            <CardContent className="p-8 text-center">
              <AlertTriangle className="w-12 h-12 text-slate-500 mx-auto mb-3 opacity-50" />
              <p className="text-slate-400">No disputes found</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredDisputes.map((dispute: DisputedChallenge) => (
              <Card key={dispute.id} className="bg-slate-900 border-slate-700">
                <CardContent className="p-6">
                  <div className="grid md:grid-cols-2 gap-6">
                    {/* Challenge Info */}
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-lg font-semibold text-white">{dispute.title}</h3>
                        <p className="text-sm text-slate-400 mt-1">{dispute.description}</p>
                      </div>

                      <div className="flex items-center justify-between">
                        <Badge className="bg-red-600">{dispute.status.replace('_', ' ').toUpperCase()}</Badge>
                        <span className="text-xs text-slate-400">
                          {formatDistanceToNow(new Date(dispute.dispuedAt), { addSuffix: true })}
                        </span>
                      </div>

                      {/* Players */}
                      <div className="bg-slate-800 p-4 rounded-lg space-y-3">
                        <h4 className="text-sm font-semibold text-slate-300">Participants</h4>
                        <div className="flex justify-between items-center">
                          <div className="text-center">
                            <p className="text-xs text-slate-400">Challenger</p>
                            <p className="text-sm text-white font-semibold">{dispute.challengerUser.username}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-xs text-slate-400">VS Stake: ₦{parseFloat(dispute.amount).toLocaleString()}</p>
                            <p className="text-sm font-bold text-blue-400">x2</p>
                          </div>
                          <div className="text-center">
                            <p className="text-xs text-slate-400">Challenged</p>
                            <p className="text-sm text-white font-semibold">{dispute.challengedUser.username}</p>
                          </div>
                        </div>
                      </div>

                      {/* Disputer Info */}
                      <div className="bg-orange-900/20 border border-orange-700 p-4 rounded-lg">
                        <p className="text-xs text-slate-400 mb-2">Disputed by</p>
                        <p className="text-sm text-orange-400 font-semibold">{dispute.disputer.username}</p>
                        <p className="text-xs text-slate-400 mt-2 font-semibold">Reason:</p>
                        <p className="text-sm text-slate-300 mt-1">{dispute.disputeReason || 'No reason provided'}</p>
                      </div>
                    </div>

                    {/* Resolution Actions */}
                    <div className="space-y-4">
                      <div className="bg-slate-800 p-4 rounded-lg space-y-3">
                        <h4 className="text-sm font-semibold text-slate-300">Resolution</h4>

                        <div>
                          <label className="text-xs text-slate-400 block mb-2">Admin Notes</label>
                          <Textarea
                            placeholder="Document your decision and reasoning..."
                            value={adminNotes}
                            onChange={(e) => setAdminNotes(e.target.value)}
                            className="bg-slate-700 border-slate-600 text-white text-sm"
                            rows={3}
                          />
                        </div>

                        <div className="space-y-2">
                          <p className="text-xs text-slate-400">⛓️ On-Chain Settlement:</p>
                          <div className="flex gap-2">
                            <Button
                              onClick={() => handleResolve(dispute, 'challenger_won')}
                              disabled={resolveMutation.isPending}
                              className="flex-1 bg-blue-600 hover:bg-blue-700 text-sm"
                            >
                              <UserCheck className="w-3 h-3 mr-1" />
                              Award Challenger
                            </Button>
                            <Button
                              onClick={() => handleResolve(dispute, 'challenged_won')}
                              disabled={resolveMutation.isPending}
                              className="flex-1 bg-green-600 hover:bg-green-700 text-sm"
                            >
                              <UserCheck className="w-3 h-3 mr-1" />
                              Award Challenged
                            </Button>
                          </div>
                          <Button
                            onClick={() => handleResolve(dispute, 'draw')}
                            disabled={resolveMutation.isPending}
                            variant="outline"
                            className="w-full border-slate-600 text-slate-300 text-sm"
                          >
                            🤝 Refund Both (Draw)
                          </Button>
                        </div>
                      </div>

                      {/* Evidence Section */}
                      {(dispute.disputeEvidence || dispute.evidence) && (
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="outline" className="w-full border-slate-600 text-slate-300">
                              <Eye className="w-4 h-4 mr-2" />
                              View Evidence
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="bg-slate-800 border-slate-700 max-w-2xl">
                            <DialogHeader>
                              <DialogTitle className="text-white">Challenge Evidence</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4">
                              {dispute.evidence && (
                                <div>
                                  <h4 className="text-sm font-semibold text-slate-300 mb-2">Challenge Evidence</h4>
                                  <pre className="bg-slate-900 p-3 rounded text-xs text-slate-300 overflow-auto max-h-48">
                                    {JSON.stringify(dispute.evidence, null, 2)}
                                  </pre>
                                </div>
                              )}
                              {dispute.disputeEvidence && (
                                <div>
                                  <h4 className="text-sm font-semibold text-slate-300 mb-2">Dispute Evidence</h4>
                                  <pre className="bg-slate-900 p-3 rounded text-xs text-slate-300 overflow-auto max-h-48">
                                    {JSON.stringify(dispute.disputeEvidence, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          </DialogContent>
                        </Dialog>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
