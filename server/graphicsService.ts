import { storage } from "./storage";
import { Segment } from "@shared/schema";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface QuoteExtraction {
  quote: string;
  speaker?: string;
  context: string;
  impact: number;
  emotion: 'inspiring' | 'shocking' | 'thought-provoking' | 'humorous' | 'urgent';
  visualStyle: 'minimal' | 'bold' | 'elegant' | 'modern' | 'corporate';
}

interface GraphicTemplate {
  id: string;
  name: string;
  width: number;
  height: number;
  backgroundColor: string;
  textColor: string;
  accentColor: string;
  fontFamily: string;
  layout: 'centered' | 'left-aligned' | 'split' | 'overlay';
}

interface BrandingConfig {
  logo?: string;
  primaryColor: string;
  secondaryColor: string;
  fontFamily: string;
  brandName: string;
}

export class GraphicsService {
  private templates: Map<string, GraphicTemplate> = new Map();

  constructor() {
    this.initializeTemplates();
  }

  private initializeTemplates(): void {
    const defaultTemplates: GraphicTemplate[] = [
      {
        id: 'minimal_quote',
        name: 'Minimal Quote',
        width: 1080,
        height: 1080,
        backgroundColor: '#FFFFFF',
        textColor: '#1F2937',
        accentColor: '#3B82F6',
        fontFamily: 'Inter, sans-serif',
        layout: 'centered'
      },
      {
        id: 'bold_impact',
        name: 'Bold Impact',
        width: 1080,
        height: 1080,
        backgroundColor: '#000000',
        textColor: '#FFFFFF',
        accentColor: '#F59E0B',
        fontFamily: 'Montserrat, sans-serif',
        layout: 'left-aligned'
      },
      {
        id: 'corporate_clean',
        name: 'Corporate Clean',
        width: 1200,
        height: 675,
        backgroundColor: '#F8FAFC',
        textColor: '#0F172A',
        accentColor: '#0EA5E9',
        fontFamily: 'system-ui, sans-serif',
        layout: 'split'
      },
      {
        id: 'modern_gradient',
        name: 'Modern Gradient',
        width: 1080,
        height: 1080,
        backgroundColor: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        textColor: '#FFFFFF',
        accentColor: '#FDE047',
        fontFamily: 'Poppins, sans-serif',
        layout: 'overlay'
      }
    ];

    defaultTemplates.forEach(template => {
      this.templates.set(template.id, template);
    });
  }

  async extractQuotes(segment: Segment): Promise<QuoteExtraction[]> {
    const prompt = `Extract 3-5 powerful, quotable moments from this transcript that would work well as social media graphics.

Transcript: "${segment.transcript}"
Context: ${segment.title} - ${segment.summary}

For each quote, provide:
1. The exact quote (15-60 words)
2. Speaker if identifiable
3. Brief context
4. Impact score (1-10)
5. Emotional tone
6. Suggested visual style

Respond in JSON format:
{
  "quotes": [
    {
      "quote": "exact text",
      "speaker": "name or null",
      "context": "brief context",
      "impact": 8,
      "emotion": "inspiring",
      "visualStyle": "bold"
    }
  ]
}`;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        max_tokens: 1000,
        temperature: 0.7,
      });

      const result = JSON.parse(response.choices[0].message.content || '{"quotes":[]}');
      return result.quotes || [];
    } catch (error) {
      console.error('[GraphicsService] Error extracting quotes:', error);
      return [];
    }
  }

  async generateQuoteGraphic(
    quote: QuoteExtraction, 
    templateId: string = 'minimal_quote',
    branding?: BrandingConfig
  ): Promise<string> {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template ${templateId} not found`);
    }

    // Generate HTML for the quote graphic
    const html = this.generateGraphicHTML(quote, template, branding);
    
    // Convert HTML to PNG using browser automation
    const imageBuffer = await this.htmlToPng(html, template.width, template.height);
    
    // Save to storage and return URL
    const filename = `quote_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.png`;
    const imageUrl = await this.saveImage(imageBuffer, filename);
    
    return imageUrl;
  }

  private generateGraphicHTML(
    quote: QuoteExtraction, 
    template: GraphicTemplate, 
    branding?: BrandingConfig
  ): string {
    const primaryColor = branding?.primaryColor || template.accentColor;
    const fontFamily = branding?.fontFamily || template.fontFamily;
    const brandName = branding?.brandName || 'AutoStage';

    let layoutStyles = '';
    let contentLayout = '';

    switch (template.layout) {
      case 'centered':
        layoutStyles = `
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          text-align: center;
          padding: 80px 60px;
        `;
        contentLayout = `
          <div class="quote-text">"${quote.quote}"</div>
          ${quote.speaker ? `<div class="speaker">— ${quote.speaker}</div>` : ''}
          <div class="brand">${brandName}</div>
        `;
        break;

      case 'left-aligned':
        layoutStyles = `
          display: flex;
          flex-direction: column;
          justify-content: center;
          padding: 80px 60px;
          text-align: left;
        `;
        contentLayout = `
          <div class="quote-mark">"</div>
          <div class="quote-text">${quote.quote}</div>
          ${quote.speaker ? `<div class="speaker">— ${quote.speaker}</div>` : ''}
          <div class="brand">${brandName}</div>
        `;
        break;

      case 'split':
        layoutStyles = `
          display: grid;
          grid-template-columns: 1fr 1fr;
          align-items: center;
          padding: 60px;
        `;
        contentLayout = `
          <div class="content">
            <div class="quote-text">"${quote.quote}"</div>
            ${quote.speaker ? `<div class="speaker">— ${quote.speaker}</div>` : ''}
          </div>
          <div class="brand-section">
            <div class="brand-large">${brandName}</div>
            <div class="context">${quote.context}</div>
          </div>
        `;
        break;

      case 'overlay':
        layoutStyles = `
          position: relative;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          text-align: center;
          padding: 80px 60px;
        `;
        contentLayout = `
          <div class="overlay"></div>
          <div class="content">
            <div class="quote-text">"${quote.quote}"</div>
            ${quote.speaker ? `<div class="speaker">— ${quote.speaker}</div>` : ''}
            <div class="brand">${brandName}</div>
          </div>
        `;
        break;
    }

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Montserrat:wght@400;600;700;800&family=Poppins:wght@400;600;700&display=swap');
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    .container {
      width: ${template.width}px;
      height: ${template.height}px;
      background: ${template.backgroundColor};
      color: ${template.textColor};
      font-family: ${fontFamily};
      position: relative;
      overflow: hidden;
      ${layoutStyles}
    }
    
    .quote-text {
      font-size: ${template.layout === 'split' ? '36px' : '42px'};
      font-weight: 600;
      line-height: 1.3;
      margin-bottom: 30px;
      max-width: 100%;
    }
    
    .quote-mark {
      font-size: 120px;
      font-weight: 800;
      color: ${primaryColor};
      line-height: 0.8;
      margin-bottom: 20px;
    }
    
    .speaker {
      font-size: 24px;
      font-weight: 500;
      color: ${primaryColor};
      margin-bottom: 40px;
    }
    
    .brand {
      font-size: 18px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 2px;
      color: ${primaryColor};
    }
    
    .brand-large {
      font-size: 48px;
      font-weight: 700;
      color: ${primaryColor};
      margin-bottom: 20px;
    }
    
    .context {
      font-size: 16px;
      opacity: 0.8;
      line-height: 1.5;
    }
    
    .overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.3);
      z-index: 1;
    }
    
    .content {
      position: relative;
      z-index: 2;
    }
    
    .brand-section {
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="container">
    ${contentLayout}
  </div>
</body>
</html>`;
  }

  private async htmlToPng(html: string, width: number, height: number): Promise<Buffer> {
    // In a real implementation, this would use Puppeteer or Playwright
    // For now, we'll simulate the process
    console.log('[GraphicsService] Converting HTML to PNG...');
    
    // Simulate image generation
    const mockImageBuffer = Buffer.from('mock-png-data');
    
    return mockImageBuffer;
  }

  private async saveImage(imageBuffer: Buffer, filename: string): Promise<string> {
    // In a real implementation, this would save to file storage
    // For now, we'll return a mock URL
    const imageUrl = `/generated/graphics/${filename}`;
    console.log(`[GraphicsService] Saved graphic: ${imageUrl}`);
    
    return imageUrl;
  }

  async generateCarouselPost(quotes: QuoteExtraction[], branding?: BrandingConfig): Promise<{
    images: string[];
    caption: string;
    hashtags: string[];
  }> {
    // Generate multiple graphics for Instagram carousel
    const images: string[] = [];
    
    for (let i = 0; i < Math.min(quotes.length, 10); i++) {
      const quote = quotes[i];
      const templateId = this.selectTemplateForQuote(quote);
      const imageUrl = await this.generateQuoteGraphic(quote, templateId, branding);
      images.push(imageUrl);
    }

    // Generate caption for the carousel post
    const caption = await this.generateCarouselCaption(quotes);
    
    // Generate relevant hashtags
    const hashtags = await this.generateHashtags(quotes);

    return { images, caption, hashtags };
  }

  private selectTemplateForQuote(quote: QuoteExtraction): string {
    const styleMapping: Record<string, string> = {
      'inspiring': 'modern_gradient',
      'shocking': 'bold_impact',
      'thought-provoking': 'minimal_quote',
      'humorous': 'minimal_quote',
      'urgent': 'bold_impact'
    };

    return styleMapping[quote.emotion] || 'minimal_quote';
  }

  private async generateCarouselCaption(quotes: QuoteExtraction[]): Promise<string> {
    const topQuotes = quotes.slice(0, 3).map(q => q.quote).join('\n\n');
    
    const prompt = `Create an engaging Instagram carousel caption for these quotes:

${topQuotes}

Requirements:
- Hook in first line
- Brief context about the content
- Call-to-action to swipe through
- Engaging and shareable tone
- 150-200 words max

Generate the caption:`;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 200,
        temperature: 0.7,
      });

      return response.choices[0].message.content?.trim() || '';
    } catch (error) {
      console.error('[GraphicsService] Error generating caption:', error);
      return 'Key insights from today\'s content ✨ Swipe to see all the powerful quotes →';
    }
  }

  private async generateHashtags(quotes: QuoteExtraction[]): Promise<string[]> {
    const context = quotes.map(q => q.context).join(' ');
    
    const prompt = `Generate 15-20 relevant hashtags for social media posts containing these themes:

Context: ${context}

Requirements:
- Mix of popular and niche hashtags
- Include industry-specific tags
- Mix of broad (#motivation) and specific tags
- No spaces in hashtags
- Return as comma-separated list

Generate hashtags:`;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 150,
        temperature: 0.6,
      });

      const hashtagText = response.choices[0].message.content?.trim() || '';
      return hashtagText.split(',').map(tag => tag.trim().replace('#', '')).filter(Boolean);
    } catch (error) {
      console.error('[GraphicsService] Error generating hashtags:', error);
      return ['quotes', 'motivation', 'inspiration', 'mindset', 'success'];
    }
  }

  async getAvailableTemplates(): Promise<GraphicTemplate[]> {
    return Array.from(this.templates.values());
  }

  async createCustomTemplate(template: Omit<GraphicTemplate, 'id'>): Promise<string> {
    const id = `custom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newTemplate: GraphicTemplate = { ...template, id };
    
    this.templates.set(id, newTemplate);
    console.log(`[GraphicsService] Created custom template: ${id}`);
    
    return id;
  }

  async processSegmentForGraphics(segmentId: string, branding?: BrandingConfig): Promise<{
    quotes: QuoteExtraction[];
    graphics: string[];
    carousel: {
      images: string[];
      caption: string;
      hashtags: string[];
    };
  }> {
    try {
      const segments = await storage.getSegmentsByUploadId(segmentId);
      const segment = segments.find(s => s.id === segmentId);
      
      if (!segment) {
        throw new Error('Segment not found');
      }

      // Extract quotes from segment
      const quotes = await this.extractQuotes(segment);
      
      // Generate individual graphics
      const graphics: string[] = [];
      for (const quote of quotes.slice(0, 5)) {
        const templateId = this.selectTemplateForQuote(quote);
        const imageUrl = await this.generateQuoteGraphic(quote, templateId, branding);
        graphics.push(imageUrl);
      }

      // Generate carousel post
      const carousel = await this.generateCarouselPost(quotes, branding);

      return { quotes, graphics, carousel };
    } catch (error) {
      console.error('[GraphicsService] Error processing segment for graphics:', error);
      throw error;
    }
  }
}

export const graphicsService = new GraphicsService();