import Stripe from 'stripe';
import { db } from './db';
import { users, subscriptions, invoices, usageRecords } from '@shared/schema';
import { eq, and, gte } from 'drizzle-orm';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY environment variable is required');
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-05-28.basil',
});

// Subscription tiers configuration
export const SUBSCRIPTION_TIERS = {
  free: {
    name: 'Free',
    priceId: null,
    price: 0,
    limits: {
      uploads: 3,
      transcriptionMinutes: 30,
      segments: 15,
      posts: 10,
      storage: 500, // MB
    },
    features: [
      'Up to 3 uploads per month',
      '30 minutes of transcription',
      'Basic social posting',
      'Standard support',
    ],
  },
  starter: {
    name: 'Starter',
    priceId: 'price_starter_monthly', // You'll need to create this in Stripe
    price: 2900, // $29/month in cents
    limits: {
      uploads: 25,
      transcriptionMinutes: 300,
      segments: 150,
      posts: 100,
      storage: 5000, // MB
    },
    features: [
      'Up to 25 uploads per month',
      '5 hours of transcription',
      'Multi-platform posting',
      'Basic analytics',
      'Email support',
    ],
  },
  pro: {
    name: 'Pro',
    priceId: 'price_pro_monthly', // You'll need to create this in Stripe
    price: 9900, // $99/month in cents
    limits: {
      uploads: 100,
      transcriptionMinutes: 1200,
      segments: 600,
      posts: 500,
      storage: 20000, // MB
    },
    features: [
      'Up to 100 uploads per month',
      '20 hours of transcription',
      'Advanced scheduling',
      'Brand voice matching',
      'Priority support',
    ],
  },
  enterprise: {
    name: 'Enterprise',
    priceId: 'price_enterprise_monthly', // You'll need to create this in Stripe
    price: 29900, // $299/month in cents
    limits: {
      uploads: -1, // Unlimited
      transcriptionMinutes: -1,
      segments: -1,
      posts: -1,
      storage: -1,
    },
    features: [
      'Unlimited uploads',
      'Unlimited transcription',
      'White-label options',
      'Custom integrations',
      'Dedicated support',
    ],
  },
} as const;

export class StripeService {
  async createCustomer(userId: string, email: string, name?: string): Promise<string> {
    try {
      const customer = await stripe.customers.create({
        email,
        name,
        metadata: { userId },
      });

      // Update user with Stripe customer ID
      await db
        .update(users)
        .set({ stripeCustomerId: customer.id })
        .where(eq(users.id, userId));

      return customer.id;
    } catch (error) {
      console.error('Error creating Stripe customer:', error);
      throw new Error('Failed to create customer');
    }
  }

  async createSubscription(userId: string, priceId: string): Promise<{ clientSecret: string; subscriptionId: string }> {
    try {
      // Validate price ID exists in our tiers
      const validPriceIds = Object.values(SUBSCRIPTION_TIERS)
        .map(tier => tier.priceId)
        .filter(id => id !== null);
      
      if (!validPriceIds.includes(priceId)) {
        throw new Error(`Invalid price ID: ${priceId}. Please create the price in your Stripe dashboard first.`);
      }

      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user) {
        throw new Error('User not found');
      }

      let customerId = user.stripeCustomerId;
      if (!customerId) {
        customerId = await this.createCustomer(userId, user.email!, `${user.firstName} ${user.lastName}`.trim());
      }

      // Verify price exists in Stripe before creating subscription
      try {
        await stripe.prices.retrieve(priceId);
      } catch (error) {
        throw new Error(`Price ID ${priceId} does not exist in Stripe. Please create it in your Stripe dashboard.`);
      }

      const subscription = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: priceId }],
        payment_behavior: 'default_incomplete',
        payment_settings: { save_default_payment_method: 'on_subscription' },
        expand: ['latest_invoice.payment_intent'],
      });

      // Save subscription to database
      await db.insert(subscriptions).values({
        userId,
        stripeSubscriptionId: subscription.id,
        stripePriceId: priceId,
        status: subscription.status,
        currentPeriodStart: new Date((subscription as any).current_period_start * 1000),
        currentPeriodEnd: new Date((subscription as any).current_period_end * 1000),
      });

      // Update user subscription info
      const tierName = Object.entries(SUBSCRIPTION_TIERS).find(([_, tier]) => tier.priceId === priceId)?.[0] || 'starter';
      await db
        .update(users)
        .set({
          stripeSubscriptionId: subscription.id,
          subscriptionStatus: subscription.status,
          subscriptionTier: tierName,
        })
        .where(eq(users.id, userId));

      const invoice = subscription.latest_invoice as any;
      const paymentIntent = invoice?.payment_intent as any;

      return {
        clientSecret: paymentIntent.client_secret!,
        subscriptionId: subscription.id,
      };
    } catch (error) {
      console.error('Error creating subscription:', error);
      throw new Error('Failed to create subscription');
    }
  }

  async cancelSubscription(userId: string, immediate = false): Promise<void> {
    try {
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user?.stripeSubscriptionId) {
        throw new Error('No active subscription found');
      }

      if (immediate) {
        await stripe.subscriptions.cancel(user.stripeSubscriptionId);
        await db
          .update(users)
          .set({
            subscriptionStatus: 'canceled',
            stripeSubscriptionId: null,
            subscriptionTier: 'free',
          })
          .where(eq(users.id, userId));
      } else {
        await stripe.subscriptions.update(user.stripeSubscriptionId, {
          cancel_at_period_end: true,
        });
        await db
          .update(subscriptions)
          .set({ cancelAtPeriodEnd: true })
          .where(eq(subscriptions.stripeSubscriptionId, user.stripeSubscriptionId));
      }
    } catch (error) {
      console.error('Error canceling subscription:', error);
      throw new Error('Failed to cancel subscription');
    }
  }

  async updateSubscription(userId: string, newPriceId: string): Promise<void> {
    try {
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user?.stripeSubscriptionId) {
        throw new Error('No active subscription found');
      }

      const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
      
      await stripe.subscriptions.update(user.stripeSubscriptionId, {
        items: [{
          id: subscription.items.data[0].id,
          price: newPriceId,
        }],
        proration_behavior: 'create_prorations',
      });

      const tierName = Object.entries(SUBSCRIPTION_TIERS).find(([_, tier]) => tier.priceId === newPriceId)?.[0] || 'starter';
      await db
        .update(users)
        .set({ subscriptionTier: tierName })
        .where(eq(users.id, userId));

      await db
        .update(subscriptions)
        .set({ stripePriceId: newPriceId })
        .where(eq(subscriptions.stripeSubscriptionId, user.stripeSubscriptionId));
    } catch (error) {
      console.error('Error updating subscription:', error);
      throw new Error('Failed to update subscription');
    }
  }

  async getUsage(userId: string, month?: string): Promise<any> {
    const targetMonth = month || new Date().toISOString().slice(0, 7); // YYYY-MM
    
    const [usage] = await db
      .select()
      .from(usageRecords)
      .where(and(eq(usageRecords.userId, userId), eq(usageRecords.month, targetMonth)));

    return usage || {
      uploadsCount: 0,
      transcriptionMinutes: 0,
      segmentsGenerated: 0,
      postsScheduled: 0,
      storageUsed: 0,
    };
  }

  async recordUsage(userId: string, type: keyof typeof usageRecords.$inferInsert, amount: number): Promise<void> {
    const month = new Date().toISOString().slice(0, 7);
    
    try {
      const [existing] = await db
        .select()
        .from(usageRecords)
        .where(and(eq(usageRecords.userId, userId), eq(usageRecords.month, month)));

      if (existing) {
        const updateData: any = { updatedAt: new Date() };
        updateData[type] = Number(existing[type] || 0) + amount;
        
        await db
          .update(usageRecords)
          .set(updateData)
          .where(and(eq(usageRecords.userId, userId), eq(usageRecords.month, month)));
      } else {
        const insertData: any = {
          userId,
          month,
          uploadsCount: 0,
          transcriptionMinutes: 0,
          segmentsGenerated: 0,
          postsScheduled: 0,
          storageUsed: 0,
        };
        insertData[type] = amount;
        
        await db.insert(usageRecords).values(insertData);
      }
    } catch (error) {
      console.error('Error recording usage:', error);
    }
  }

  async checkLimits(userId: string): Promise<{ allowed: boolean; limits: any; usage: any; tier: string }> {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) {
      throw new Error('User not found');
    }

    const tier = SUBSCRIPTION_TIERS[user.subscriptionTier as keyof typeof SUBSCRIPTION_TIERS] || SUBSCRIPTION_TIERS.free;
    const usage = await this.getUsage(userId);

    const allowed = Object.entries(tier.limits).every(([key, limit]) => {
      if (limit === -1) return true; // Unlimited
      return (usage[key] || 0) < limit;
    });

    return {
      allowed,
      limits: tier.limits,
      usage,
      tier: user.subscriptionTier || 'free',
    };
  }

  async handleWebhook(event: Stripe.Event): Promise<void> {
    try {
      switch (event.type) {
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted': {
          const subscription = event.data.object as Stripe.Subscription;
          await this.updateSubscriptionFromWebhook(subscription);
          break;
        }
        case 'invoice.payment_succeeded': {
          const invoice = event.data.object as Stripe.Invoice;
          await this.handleSuccessfulPayment(invoice);
          break;
        }
        case 'invoice.payment_failed': {
          const invoice = event.data.object as Stripe.Invoice;
          await this.handleFailedPayment(invoice);
          break;
        }
      }
    } catch (error) {
      console.error('Error handling webhook:', error);
      throw error;
    }
  }

  private async updateSubscriptionFromWebhook(stripeSubscription: Stripe.Subscription): Promise<void> {
    const customerId = stripeSubscription.customer as string;
    const customer = await stripe.customers.retrieve(customerId);
    const userId = (customer as Stripe.Customer).metadata?.userId;

    if (!userId) return;

    const tierName = Object.entries(SUBSCRIPTION_TIERS).find(([_, tier]) => 
      tier.priceId === stripeSubscription.items.data[0]?.price.id
    )?.[0] || 'free';

    await db
      .update(users)
      .set({
        subscriptionStatus: stripeSubscription.status,
        subscriptionTier: stripeSubscription.status === 'active' ? tierName : 'free',
      })
      .where(eq(users.id, userId));

    // Update subscription record
    await db
      .update(subscriptions)
      .set({
        status: stripeSubscription.status,
        currentPeriodStart: new Date((stripeSubscription as any).current_period_start * 1000),
        currentPeriodEnd: new Date((stripeSubscription as any).current_period_end * 1000),
        cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
      })
      .where(eq(subscriptions.stripeSubscriptionId, stripeSubscription.id));
  }

  private async handleSuccessfulPayment(invoice: Stripe.Invoice): Promise<void> {
    const customerId = invoice.customer as string;
    const customer = await stripe.customers.retrieve(customerId);
    const userId = (customer as Stripe.Customer).metadata?.userId;

    if (!userId) return;

    // Only record actual paid invoices with real data
    if (invoice.status === 'paid' && invoice.amount_paid && invoice.amount_paid > 0) {
      await db.insert(invoices).values({
        userId,
        stripeInvoiceId: invoice.id,
        amount: invoice.amount_paid,
        currency: invoice.currency || 'usd',
        status: 'paid',
        paidAt: new Date((invoice.status_transitions as any)?.paid_at * 1000),
      });
    }
  }

  private async handleFailedPayment(invoice: Stripe.Invoice): Promise<void> {
    const customerId = invoice.customer as string;
    const customer = await stripe.customers.retrieve(customerId);
    const userId = (customer as Stripe.Customer).metadata?.userId;

    if (!userId) return;

    await db
      .update(users)
      .set({ subscriptionStatus: 'past_due' })
      .where(eq(users.id, userId));
  }
}

export const stripeService = new StripeService();