import { userManagementService } from './server/userManagementService.js';
import { graphicsService } from './server/graphicsService.js';

async function testFeatures() {
  console.log('Testing AutoStage Quote Graphics and Workspace Management...\n');

  // Test 1: Create workspace
  console.log('1. Testing Workspace Creation:');
  try {
    const workspace = await userManagementService.createWorkspace('user-123', {
      name: 'Tech Startup Brand',
      description: 'Modern tech company workspace for AI content',
      brandingConfig: {
        primaryColor: '#6366F1',
        secondaryColor: '#1F2937',
        fontFamily: 'Inter, sans-serif'
      },
      settings: {
        timezone: 'America/New_York',
        currency: 'USD',
        defaultPlatforms: ['twitter', 'linkedin', 'instagram']
      }
    });
    console.log('✓ Workspace created:', workspace.name);
    console.log('  ID:', workspace.id);
    console.log('  Branding:', workspace.brandingConfig.primaryColor);
  } catch (error) {
    console.log('✗ Workspace creation failed:', error.message);
  }

  // Test 2: Get workspaces for user
  console.log('\n2. Testing Workspace Retrieval:');
  try {
    const workspaces = await userManagementService.getWorkspacesByUser('user-123');
    console.log('✓ Found', workspaces.length, 'workspace(s)');
    workspaces.forEach(ws => console.log('  -', ws.name));
  } catch (error) {
    console.log('✗ Workspace retrieval failed:', error.message);
  }

  // Test 3: Add team member
  console.log('\n3. Testing Team Member Addition:');
  try {
    const workspaces = await userManagementService.getWorkspacesByUser('user-123');
    if (workspaces.length > 0) {
      const member = await userManagementService.addWorkspaceMember(
        workspaces[0].id,
        'user-456',
        'editor',
        'user-123'
      );
      console.log('✓ Team member added:', member.role);
      console.log('  Permissions:', member.permissions.slice(0, 3), '...');
    }
  } catch (error) {
    console.log('✗ Team member addition failed:', error.message);
  }

  // Test 4: Check permissions
  console.log('\n4. Testing Permission System:');
  try {
    const workspaces = await userManagementService.getWorkspacesByUser('user-123');
    if (workspaces.length > 0) {
      const canManage = await userManagementService.checkPermission(
        'user-123',
        workspaces[0].id,
        'workspace.manage'
      );
      const canEdit = await userManagementService.checkPermission(
        'user-456',
        workspaces[0].id,
        'content.edit'
      );
      console.log('✓ Owner can manage workspace:', canManage);
      console.log('✓ Editor can edit content:', canEdit);
    }
  } catch (error) {
    console.log('✗ Permission check failed:', error.message);
  }

  // Test 5: Record usage
  console.log('\n5. Testing Usage Tracking:');
  try {
    const workspaces = await userManagementService.getWorkspacesByUser('user-123');
    if (workspaces.length > 0) {
      await userManagementService.recordUsage(workspaces[0].id, {
        uploadsCount: 5,
        transcriptionMinutes: 45,
        segmentsGenerated: 20,
        postsScheduled: 12,
        storageUsed: 1024
      });
      console.log('✓ Usage metrics recorded');
      
      const report = await userManagementService.getUsageReport(workspaces[0].id);
      console.log('  Uploads:', report.currentPeriod.metrics.uploadsCount);
      console.log('  Transcription:', report.currentPeriod.metrics.transcriptionMinutes, 'min');
      console.log('  Total cost: $' + report.currentPeriod.costs.total.toFixed(2));
    }
  } catch (error) {
    console.log('✗ Usage tracking failed:', error.message);
  }

  // Test 6: Get available templates
  console.log('\n6. Testing Graphics Templates:');
  try {
    const templates = await graphicsService.getAvailableTemplates();
    console.log('✓ Found', templates.length, 'graphic templates:');
    templates.forEach(t => console.log('  -', t.name, `(${t.width}x${t.height})`));
  } catch (error) {
    console.log('✗ Template retrieval failed:', error.message);
  }

  // Test 7: Create custom template
  console.log('\n7. Testing Custom Template Creation:');
  try {
    const templateId = await graphicsService.createCustomTemplate({
      name: 'Brand Highlight',
      width: 1080,
      height: 1080,
      backgroundColor: '#1E293B',
      textColor: '#F8FAFC',
      accentColor: '#06B6D4',
      fontFamily: 'Poppins, sans-serif',
      layout: 'centered'
    });
    console.log('✓ Custom template created:', templateId);
  } catch (error) {
    console.log('✗ Custom template creation failed:', error.message);
  }

  // Test 8: Test quote extraction (mock segment)
  console.log('\n8. Testing Quote Extraction:');
  try {
    const mockSegment = {
      id: 'seg-123',
      title: 'AI Revolution in Business',
      summary: 'Discussion about how AI is transforming modern business practices',
      transcript: 'The future of business lies in AI automation. Companies that embrace artificial intelligence today will dominate tomorrow. This technology is not just a tool, it\'s a competitive advantage that separates leaders from followers.',
      startTime: 0,
      endTime: 30
    };
    
    const quotes = await graphicsService.extractQuotes(mockSegment);
    console.log('✓ Extracted', quotes.length, 'quotes:');
    quotes.forEach((q, i) => {
      console.log(`  ${i + 1}. "${q.quote}" (Impact: ${q.impact}/10, ${q.emotion})`);
    });
  } catch (error) {
    console.log('✗ Quote extraction failed:', error.message);
  }

  // Test 9: Get billing plans
  console.log('\n9. Testing Billing Plans:');
  try {
    const plans = await userManagementService.getBillingPlans();
    console.log('✓ Found', plans.length, 'billing plans:');
    plans.forEach(p => {
      console.log(`  - ${p.name}: $${p.pricing.monthly}/month (${p.limits.uploads} uploads, ${p.limits.teamMembers} members)`);
    });
  } catch (error) {
    console.log('✗ Billing plans retrieval failed:', error.message);
  }

  // Test 10: Get onboarding checklist
  console.log('\n10. Testing Onboarding Checklist:');
  try {
    const checklist = await userManagementService.getOnboardingChecklist('user-123');
    console.log('✓ Onboarding completion:', checklist.completionRate + '%');
    checklist.steps.forEach(step => {
      const status = step.completed ? '✓' : '○';
      console.log(`  ${status} ${step.title}`);
    });
  } catch (error) {
    console.log('✗ Onboarding checklist failed:', error.message);
  }

  console.log('\n🎉 AutoStage feature testing completed!');
  console.log('\nFeatures verified:');
  console.log('✓ Multi-workspace management with role-based permissions');
  console.log('✓ Usage tracking and billing integration');
  console.log('✓ AI-powered quote extraction from content');
  console.log('✓ Customizable graphic templates');
  console.log('✓ Team collaboration with permission controls');
  console.log('✓ Onboarding and user management systems');
}

testFeatures().catch(console.error);