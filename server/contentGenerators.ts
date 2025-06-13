import { storage } from "./storage";
import { Segment } from "@shared/schema";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface BlogPost {
  title: string;
  metaDescription: string;
  content: string;
  headings: {
    h2: string[];
    h3: string[];
  };
  faq: Array<{
    question: string;
    answer: string;
  }>;
  tags: string[];
  estimatedReadTime: number;
}

interface NewsletterIssue {
  subject: string;
  plainText: string;
  html: string;
  previewText: string;
  sections: Array<{
    title: string;
    content: string;
    type: 'intro' | 'main' | 'insights' | 'cta' | 'outro';
  }>;
}

interface ThumbnailTemplate {
  id: string;
  name: string;
  style: 'bold' | 'minimal' | 'cinematic' | 'educational' | 'entertainment';
  backgroundColor: string;
  textColor: string;
  fontSize: string;
  layout: 'left-text' | 'center-text' | 'split' | 'overlay';
}

export class ContentGenerators {
  private thumbnailTemplates: Map<string, ThumbnailTemplate> = new Map();

  constructor() {
    this.initializeThumbnailTemplates();
  }

  private initializeThumbnailTemplates(): void {
    const templates: ThumbnailTemplate[] = [
      {
        id: 'bold_impact',
        name: 'Bold Impact',
        style: 'bold',
        backgroundColor: '#FF0000',
        textColor: '#FFFFFF',
        fontSize: '72px',
        layout: 'center-text'
      },
      {
        id: 'minimal_clean',
        name: 'Minimal Clean',
        style: 'minimal',
        backgroundColor: '#FFFFFF',
        textColor: '#000000',
        fontSize: '48px',
        layout: 'left-text'
      },
      {
        id: 'cinematic_dark',
        name: 'Cinematic Dark',
        style: 'cinematic',
        backgroundColor: '#1a1a1a',
        textColor: '#FFD700',
        fontSize: '64px',
        layout: 'overlay'
      },
      {
        id: 'educational_blue',
        name: 'Educational Blue',
        style: 'educational',
        backgroundColor: '#1E3A8A',
        textColor: '#FFFFFF',
        fontSize: '56px',
        layout: 'split'
      }
    ];

    templates.forEach(template => {
      this.thumbnailTemplates.set(template.id, template);
    });
  }

  async generateSEOBlog(segments: Segment[], topic: string, targetKeywords: string[]): Promise<BlogPost> {
    // Combine segment content for comprehensive blog generation
    const combinedContent = segments.map(s => `${s.title}: ${s.summary}\n${s.transcript}`).join('\n\n');
    
    const prompt = `Create a comprehensive 1000-word SEO blog post from this content:

Topic: ${topic}
Target Keywords: ${targetKeywords.join(', ')}

Content Source:
${combinedContent}

Requirements:
1. Engaging title with primary keyword
2. Meta description (150-160 chars)
3. Well-structured content with H2 and H3 headings
4. Natural keyword integration
5. FAQ section (5 questions)
6. Internal linking opportunities
7. Actionable insights and takeaways

Respond in JSON format:
{
  "title": "SEO-optimized title",
  "metaDescription": "compelling meta description",
  "content": "full blog post with markdown formatting",
  "headings": {
    "h2": ["heading1", "heading2"],
    "h3": ["subheading1", "subheading2"]
  },
  "faq": [
    {"question": "Q1", "answer": "A1"},
    {"question": "Q2", "answer": "A2"}
  ],
  "tags": ["tag1", "tag2", "tag3"]
}`;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        max_tokens: 2000,
        temperature: 0.7,
      });

      const blogData = JSON.parse(response.choices[0].message.content || '{}');
      
      // Calculate estimated read time (average 200 words per minute)
      const wordCount = blogData.content.split(' ').length;
      const estimatedReadTime = Math.ceil(wordCount / 200);

      return {
        ...blogData,
        estimatedReadTime
      };
    } catch (error) {
      console.error('[ContentGenerators] Error generating SEO blog:', error);
      throw new Error('Failed to generate SEO blog post');
    }
  }

  async generateNewsletter(segments: Segment[], brandName: string, audienceType: string = 'general'): Promise<NewsletterIssue> {
    const combinedContent = segments.map(s => `${s.title}: ${s.summary}`).join('\n');
    
    const prompt = `Create a newsletter issue from this content:

Brand: ${brandName}
Audience: ${audienceType}
Content: ${combinedContent}

Requirements:
1. Compelling subject line
2. Preview text for email clients
3. Multiple sections (intro, main insights, actionable takeaways, CTA)
4. Both plain text and HTML versions
5. Conversational but professional tone
6. Clear value proposition

Respond in JSON format:
{
  "subject": "newsletter subject line",
  "previewText": "preview text",
  "sections": [
    {
      "title": "section title",
      "content": "section content",
      "type": "intro|main|insights|cta|outro"
    }
  ]
}`;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        max_tokens: 1500,
        temperature: 0.7,
      });

      const newsletterData = JSON.parse(response.choices[0].message.content || '{}');
      
      // Generate plain text version
      const plainText = this.generatePlainTextNewsletter(newsletterData);
      
      // Generate HTML version
      const html = this.generateHTMLNewsletter(newsletterData, brandName);

      return {
        subject: newsletterData.subject,
        previewText: newsletterData.previewText,
        sections: newsletterData.sections,
        plainText,
        html
      };
    } catch (error) {
      console.error('[ContentGenerators] Error generating newsletter:', error);
      throw new Error('Failed to generate newsletter');
    }
  }

  private generatePlainTextNewsletter(data: any): string {
    let plainText = `${data.subject}\n${'='.repeat(data.subject.length)}\n\n`;
    
    data.sections.forEach((section: any, index: number) => {
      plainText += `${index + 1}. ${section.title}\n`;
      plainText += `${'-'.repeat(section.title.length)}\n`;
      plainText += `${section.content}\n\n`;
    });

    return plainText;
  }

  private generateHTMLNewsletter(data: any, brandName: string): string {
    const sectionsHTML = data.sections.map((section: any) => `
      <div style="margin-bottom: 30px;">
        <h2 style="color: #2563eb; font-size: 24px; margin-bottom: 15px;">${section.title}</h2>
        <div style="line-height: 1.6; color: #374151;">
          ${section.content.replace(/\n/g, '<br>')}
        </div>
      </div>
    `).join('');

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${data.subject}</title>
</head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
  <div style="background-color: white; padding: 40px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <!-- Header -->
    <div style="text-align: center; margin-bottom: 40px; border-bottom: 2px solid #e5e7eb; padding-bottom: 20px;">
      <h1 style="color: #1f2937; font-size: 32px; margin: 0;">${brandName}</h1>
      <p style="color: #6b7280; margin: 10px 0 0 0;">${data.previewText}</p>
    </div>

    <!-- Content -->
    ${sectionsHTML}

    <!-- Footer -->
    <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center; color: #6b7280; font-size: 14px;">
      <p>© ${new Date().getFullYear()} ${brandName}. All rights reserved.</p>
      <p>
        <a href="#" style="color: #2563eb; text-decoration: none;">Unsubscribe</a> | 
        <a href="#" style="color: #2563eb; text-decoration: none;">Update Preferences</a>
      </p>
    </div>
  </div>
</body>
</html>`;
  }

  async generateThumbnail(segment: Segment, templateId: string = 'bold_impact'): Promise<{
    imageUrl: string;
    title: string;
    template: ThumbnailTemplate;
  }> {
    const template = this.thumbnailTemplates.get(templateId);
    if (!template) {
      throw new Error(`Thumbnail template ${templateId} not found`);
    }

    // Generate compelling thumbnail title
    const titlePrompt = `Create a compelling YouTube thumbnail title from this content:

Title: ${segment.title}
Summary: ${segment.summary}

Requirements:
- Maximum 6 words
- High impact and clickable
- Emotional trigger words
- Numbers when relevant
- Avoid clickbait

Return just the thumbnail title text:`;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: titlePrompt }],
        max_tokens: 50,
        temperature: 0.8,
      });

      const thumbnailTitle = response.choices[0].message.content?.trim() || segment.title;
      
      // Generate thumbnail image (in real implementation, this would use Canvas/Playwright)
      const imageUrl = await this.createThumbnailImage(thumbnailTitle, template);

      return {
        imageUrl,
        title: thumbnailTitle,
        template
      };
    } catch (error) {
      console.error('[ContentGenerators] Error generating thumbnail:', error);
      throw new Error('Failed to generate thumbnail');
    }
  }

  private async createThumbnailImage(title: string, template: ThumbnailTemplate): Promise<string> {
    // In a real implementation, this would use Canvas or Playwright to generate actual images
    // For now, we'll return a placeholder URL
    const filename = `thumbnail_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.png`;
    const imageUrl = `/generated/thumbnails/${filename}`;
    
    console.log(`[ContentGenerators] Generated thumbnail: ${imageUrl} with title: "${title}"`);
    
    return imageUrl;
  }

  async getThumbnailTemplates(): Promise<ThumbnailTemplate[]> {
    return Array.from(this.thumbnailTemplates.values());
  }

  async createCustomThumbnailTemplate(template: Omit<ThumbnailTemplate, 'id'>): Promise<string> {
    const id = `custom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newTemplate: ThumbnailTemplate = { ...template, id };
    
    this.thumbnailTemplates.set(id, newTemplate);
    console.log(`[ContentGenerators] Created custom thumbnail template: ${id}`);
    
    return id;
  }

  async processSegmentsForContent(uploadId: string): Promise<{
    blog: BlogPost;
    newsletter: NewsletterIssue;
    thumbnails: Array<{
      segmentId: string;
      imageUrl: string;
      title: string;
    }>;
  }> {
    try {
      const segments = await storage.getSegmentsByUploadId(uploadId);
      
      if (segments.length === 0) {
        throw new Error('No segments found for upload');
      }

      // Extract topic from segments
      const topic = segments[0].title;
      const keywords = segments.map(s => s.title.split(' ').slice(0, 2)).flat();

      // Generate SEO blog from all segments
      const blog = await this.generateSEOBlog(segments, topic, keywords);

      // Generate newsletter from top segments
      const topSegments = segments.slice(0, 3);
      const newsletter = await this.generateNewsletter(topSegments, 'AutoStage', 'content creators');

      // Generate thumbnails for each segment
      const thumbnails = [];
      for (const segment of segments.slice(0, 5)) {
        const thumbnail = await this.generateThumbnail(segment);
        thumbnails.push({
          segmentId: segment.id,
          imageUrl: thumbnail.imageUrl,
          title: thumbnail.title
        });
      }

      return { blog, newsletter, thumbnails };
    } catch (error) {
      console.error('[ContentGenerators] Error processing segments for content:', error);
      throw error;
    }
  }
}

export const contentGenerators = new ContentGenerators();