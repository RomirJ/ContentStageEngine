import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { Navigation } from '@/components/Navigation';
import { CreditCard, Users, Upload, Clock, Database, CheckCircle } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

if (!import.meta.env.VITE_STRIPE_PUBLIC_KEY) {
  throw new Error('Missing required Stripe key: VITE_STRIPE_PUBLIC_KEY');
}
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY);

const CheckoutForm = ({ priceId, onSuccess }: { priceId: string; onSuccess: () => void }) => {
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setLoading(true);
    try {
      const { error } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: window.location.origin + '/billing',
        },
      });

      if (error) {
        toast({
          title: "Payment Failed",
          description: error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Payment Successful",
          description: "Your subscription has been activated!",
        });
        onSuccess();
      }
    } catch (error) {
      toast({
        title: "Payment Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <PaymentElement />
      <Button type="submit" disabled={!stripe || loading} className="w-full">
        {loading ? 'Processing...' : 'Subscribe'}
      </Button>
    </form>
  );
};

export default function Billing() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);

  // Fetch subscription tiers
  const { data: tiers } = useQuery({
    queryKey: ['/api/billing/tiers'],
  });

  // Fetch current usage
  const { data: usage } = useQuery({
    queryKey: ['/api/billing/usage'],
  });

  // Fetch usage limits
  const { data: limits } = useQuery({
    queryKey: ['/api/billing/limits'],
  });

  const createSubscription = useMutation({
    mutationFn: async (priceId: string) => {
      const response = await apiRequest('POST', '/api/billing/create-subscription', { priceId });
      return response.json();
    },
    onSuccess: (data) => {
      setClientSecret(data.clientSecret);
    },
    onError: (error) => {
      toast({
        title: "Subscription Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const cancelSubscription = useMutation({
    mutationFn: async (immediate: boolean = false) => {
      const response = await apiRequest('POST', '/api/billing/cancel-subscription', { immediate });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
      toast({
        title: "Subscription Canceled",
        description: "Your subscription has been canceled.",
      });
    },
  });

  const handleSubscribe = (priceId: string) => {
    setSelectedPlan(priceId);
    createSubscription.mutate(priceId);
  };

  const getUsagePercentage = (used: number, limit: number) => {
    if (limit === -1) return 0; // Unlimited
    return Math.min((used / limit) * 100, 100);
  };

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100);
  };

  if (clientSecret) {
    return (
      <div className="container mx-auto p-6">
        <Navigation title="Complete Subscription" />
        
        <div className="max-w-md mx-auto mt-8">
          <Card>
            <CardHeader>
              <CardTitle>Complete Your Subscription</CardTitle>
              <CardDescription>
                Enter your payment details to activate your subscription
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Elements 
                stripe={stripePromise} 
                options={{ 
                  clientSecret,
                  appearance: { theme: 'stripe' }
                }}
              >
                <CheckoutForm 
                  priceId={selectedPlan!} 
                  onSuccess={() => {
                    setClientSecret(null);
                    setSelectedPlan(null);
                    queryClient.invalidateQueries();
                  }} 
                />
              </Elements>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <Navigation title="Billing & Subscription" />

      <Tabs defaultValue="plans" className="space-y-6">
        <TabsList>
          <TabsTrigger value="plans">Subscription Plans</TabsTrigger>
          <TabsTrigger value="usage">Current Usage</TabsTrigger>
        </TabsList>

        <TabsContent value="plans" className="space-y-6">
          {/* Current Plan Status */}
          {user && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Current Plan
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <Badge variant={user.subscriptionStatus === 'active' ? 'default' : 'secondary'}>
                      {user.subscriptionTier?.charAt(0).toUpperCase() + user.subscriptionTier?.slice(1) || 'Free'}
                    </Badge>
                    <p className="text-sm text-muted-foreground mt-1">
                      Status: {user.subscriptionStatus || 'free'}
                    </p>
                  </div>
                  {user.subscriptionStatus === 'active' && (
                    <Button 
                      variant="outline" 
                      onClick={() => cancelSubscription.mutate(false)}
                      disabled={cancelSubscription.isPending}
                    >
                      Cancel at Period End
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Pricing Plans */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {tiers && Object.entries(tiers).map(([tier, details]: [string, any]) => (
              <Card key={tier} className={`relative ${user?.subscriptionTier === tier ? 'ring-2 ring-primary' : ''}`}>
                {details.name === 'Pro' && (
                  <Badge className="absolute -top-2 left-1/2 transform -translate-x-1/2">
                    Most Popular
                  </Badge>
                )}
                <CardHeader>
                  <CardTitle>{details.name}</CardTitle>
                  <CardDescription>
                    {details.price === 0 ? 'Free' : formatPrice(details.price)}
                    {details.price > 0 && <span className="text-sm">/month</span>}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="space-y-2 text-sm">
                    {details.features.map((feature: string, index: number) => (
                      <li key={index} className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  
                  {tier !== 'free' && user?.subscriptionTier !== tier && (
                    <Button 
                      className="w-full" 
                      onClick={() => handleSubscribe(details.priceId)}
                      disabled={createSubscription.isPending}
                    >
                      {createSubscription.isPending ? 'Processing...' : 'Subscribe'}
                    </Button>
                  )}
                  
                  {user?.subscriptionTier === tier && (
                    <Button variant="outline" className="w-full" disabled>
                      Current Plan
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="usage" className="space-y-6">
          {usage && limits && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <Card>
                <CardHeader className="flex flex-row items-center space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Uploads</CardTitle>
                  <Upload className="h-4 w-4 ml-auto" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {usage.uploadsCount} / {limits.limits.uploads === -1 ? '∞' : limits.limits.uploads}
                  </div>
                  {limits.limits.uploads !== -1 && (
                    <Progress 
                      value={getUsagePercentage(usage.uploadsCount, limits.limits.uploads)} 
                      className="mt-2"
                    />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Transcription</CardTitle>
                  <Clock className="h-4 w-4 ml-auto" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {usage.transcriptionMinutes} / {limits.limits.transcriptionMinutes === -1 ? '∞' : limits.limits.transcriptionMinutes} min
                  </div>
                  {limits.limits.transcriptionMinutes !== -1 && (
                    <Progress 
                      value={getUsagePercentage(usage.transcriptionMinutes, limits.limits.transcriptionMinutes)} 
                      className="mt-2"
                    />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Storage</CardTitle>
                  <Database className="h-4 w-4 ml-auto" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {Math.round(usage.storageUsed / 1024 * 100) / 100} / {limits.limits.storage === -1 ? '∞' : Math.round(limits.limits.storage / 1024 * 100) / 100} GB
                  </div>
                  {limits.limits.storage !== -1 && (
                    <Progress 
                      value={getUsagePercentage(usage.storageUsed, limits.limits.storage)} 
                      className="mt-2"
                    />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Segments</CardTitle>
                  <Users className="h-4 w-4 ml-auto" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {usage.segmentsGenerated} / {limits.limits.segments === -1 ? '∞' : limits.limits.segments}
                  </div>
                  {limits.limits.segments !== -1 && (
                    <Progress 
                      value={getUsagePercentage(usage.segmentsGenerated, limits.limits.segments)} 
                      className="mt-2"
                    />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Posts Scheduled</CardTitle>
                  <CreditCard className="h-4 w-4 ml-auto" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {usage.postsScheduled} / {limits.limits.posts === -1 ? '∞' : limits.limits.posts}
                  </div>
                  {limits.limits.posts !== -1 && (
                    <Progress 
                      value={getUsagePercentage(usage.postsScheduled, limits.limits.posts)} 
                      className="mt-2"
                    />
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {!limits?.allowed && (
            <Card className="border-orange-200 bg-orange-50">
              <CardHeader>
                <CardTitle className="text-orange-800">Usage Limit Reached</CardTitle>
                <CardDescription className="text-orange-600">
                  You've reached your plan's usage limits. Upgrade to continue using AutoStage.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={() => document.querySelector('[data-tab="plans"]')?.click()}>
                  View Upgrade Options
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}