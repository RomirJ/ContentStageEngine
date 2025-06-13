import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  Image, 
  Download, 
  Palette, 
  Type,
  Layout,
  Sparkles,
  Copy,
  Share,
  Instagram,
  Twitter,
  Linkedin
} from "lucide-react";

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
  primaryColor: string;
  secondaryColor: string;
  fontFamily: string;
  brandName: string;
}

interface QuoteGraphicsGeneratorProps {
  segmentId: string;
  onGraphicsGenerated?: (graphics: string[]) => void;
}

export default function QuoteGraphicsGenerator({ segmentId, onGraphicsGenerated }: QuoteGraphicsGeneratorProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<string>('minimal_quote');
  const [branding, setBranding] = useState<BrandingConfig>({
    primaryColor: '#3B82F6',
    secondaryColor: '#1F2937',
    fontFamily: 'Inter, sans-serif',
    brandName: 'AutoStage'
  });
  const [selectedQuotes, setSelectedQuotes] = useState<Set<number>>(new Set());
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch available templates
  const { data: templates = [], isLoading: templatesLoading } = useQuery({
    queryKey: ['/api/graphics/templates'],
  });

  // Generate quote graphics mutation
  const generateGraphicsMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/graphics/quotes/${segmentId}`, 'POST', { branding });
    },
    onSuccess: (data) => {
      toast({ title: "Quote graphics generated successfully" });
      if (onGraphicsGenerated) {
        onGraphicsGenerated(data.graphics);
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to generate graphics",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const { data: graphicsData, isLoading: graphicsLoading } = useQuery({
    queryKey: [`/api/graphics/quotes/${segmentId}`],
    enabled: !!segmentId,
    retry: false,
  });

  const quotes: QuoteExtraction[] = graphicsData?.quotes || [];
  const generatedGraphics: string[] = graphicsData?.graphics || [];
  const carousel = graphicsData?.carousel;

  const handleGenerateGraphics = async () => {
    if (selectedQuotes.size === 0) {
      toast({
        title: "No quotes selected",
        description: "Please select at least one quote to generate graphics",
        variant: "destructive",
      });
      return;
    }

    generateGraphicsMutation.mutate();
  };

  const getEmotionColor = (emotion: string) => {
    const colors: Record<string, string> = {
      inspiring: "bg-green-100 text-green-800",
      shocking: "bg-red-100 text-red-800",
      'thought-provoking': "bg-purple-100 text-purple-800",
      humorous: "bg-yellow-100 text-yellow-800",
      urgent: "bg-orange-100 text-orange-800",
    };
    return colors[emotion] || "bg-gray-100 text-gray-800";
  };

  const handleQuoteSelection = (index: number) => {
    const newSelection = new Set(selectedQuotes);
    if (newSelection.has(index)) {
      newSelection.delete(index);
    } else {
      newSelection.add(index);
    }
    setSelectedQuotes(newSelection);
  };

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard" });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-xl font-bold">Quote Graphics Generator</h3>
          <p className="text-muted-foreground">
            Create shareable quote graphics from your content
          </p>
        </div>
        <Button
          onClick={handleGenerateGraphics}
          disabled={generateGraphicsMutation.isPending || selectedQuotes.size === 0}
          className="flex items-center gap-2"
        >
          <Sparkles className="h-4 w-4" />
          Generate Graphics
        </Button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Configuration Panel */}
        <Card className="xl:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="h-5 w-5" />
              Branding & Style
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Template Selection */}
            <div>
              <Label>Template</Label>
              <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                <SelectTrigger>
                  <SelectValue placeholder="Select template" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((template: GraphicTemplate) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Brand Colors */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Primary Color</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="color"
                    value={branding.primaryColor}
                    onChange={(e) => setBranding({...branding, primaryColor: e.target.value})}
                    className="w-12 h-8 p-1"
                  />
                  <Input
                    value={branding.primaryColor}
                    onChange={(e) => setBranding({...branding, primaryColor: e.target.value})}
                    className="flex-1"
                  />
                </div>
              </div>
              <div>
                <Label>Secondary Color</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="color"
                    value={branding.secondaryColor}
                    onChange={(e) => setBranding({...branding, secondaryColor: e.target.value})}
                    className="w-12 h-8 p-1"
                  />
                  <Input
                    value={branding.secondaryColor}
                    onChange={(e) => setBranding({...branding, secondaryColor: e.target.value})}
                    className="flex-1"
                  />
                </div>
              </div>
            </div>

            {/* Font Family */}
            <div>
              <Label>Font Family</Label>
              <Select 
                value={branding.fontFamily} 
                onValueChange={(value) => setBranding({...branding, fontFamily: value})}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Inter, sans-serif">Inter</SelectItem>
                  <SelectItem value="Montserrat, sans-serif">Montserrat</SelectItem>
                  <SelectItem value="Poppins, sans-serif">Poppins</SelectItem>
                  <SelectItem value="system-ui, sans-serif">System UI</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Brand Name */}
            <div>
              <Label>Brand Name</Label>
              <Input
                value={branding.brandName}
                onChange={(e) => setBranding({...branding, brandName: e.target.value})}
                placeholder="Your brand name"
              />
            </div>
          </CardContent>
        </Card>

        {/* Quotes Selection */}
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Type className="h-5 w-5" />
              Select Quotes ({selectedQuotes.size} selected)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {graphicsLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="animate-pulse border rounded-lg p-4">
                    <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                    <div className="h-16 bg-gray-200 rounded mb-2"></div>
                    <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                  </div>
                ))}
              </div>
            ) : quotes.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Type className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No quotes found</p>
                <p className="text-xs">Generate quotes from your content first</p>
              </div>
            ) : (
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {quotes.map((quote, index) => (
                  <div 
                    key={index} 
                    className={`border rounded-lg p-4 cursor-pointer transition-all ${
                      selectedQuotes.has(index) 
                        ? 'border-blue-500 bg-blue-50' 
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => handleQuoteSelection(index)}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Badge className={getEmotionColor(quote.emotion)}>
                          {quote.emotion}
                        </Badge>
                        <Badge variant="outline">
                          Impact: {quote.impact}/10
                        </Badge>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          copyToClipboard(quote.quote);
                        }}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                    
                    <blockquote className="text-lg font-medium mb-2 leading-relaxed">
                      "{quote.quote}"
                    </blockquote>
                    
                    {quote.speaker && (
                      <p className="text-sm text-muted-foreground mb-2">
                        — {quote.speaker}
                      </p>
                    )}
                    
                    <p className="text-xs text-muted-foreground">
                      {quote.context}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Generated Graphics */}
      {generatedGraphics.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Image className="h-5 w-5" />
              Generated Graphics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {generatedGraphics.map((graphic, index) => (
                <div key={index} className="border rounded-lg overflow-hidden">
                  <div className="aspect-square bg-gray-100 flex items-center justify-center">
                    <Image className="h-8 w-8 text-gray-400" />
                    <span className="ml-2 text-sm text-gray-500">Quote Graphic {index + 1}</span>
                  </div>
                  <div className="p-3 space-y-2">
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="flex-1">
                        <Download className="h-3 w-3 mr-1" />
                        Download
                      </Button>
                      <Button size="sm" variant="outline">
                        <Share className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" className="text-xs">
                        <Instagram className="h-3 w-3 mr-1" />
                        IG
                      </Button>
                      <Button size="sm" variant="ghost" className="text-xs">
                        <Twitter className="h-3 w-3 mr-1" />
                        X
                      </Button>
                      <Button size="sm" variant="ghost" className="text-xs">
                        <Linkedin className="h-3 w-3 mr-1" />
                        LI
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Carousel Post */}
      {carousel && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Layout className="h-5 w-5" />
              Instagram Carousel Post
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Caption</Label>
              <div className="bg-gray-50 p-3 rounded border">
                <p className="text-sm whitespace-pre-wrap">{carousel.caption}</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={() => copyToClipboard(carousel.caption)}
              >
                <Copy className="h-3 w-3 mr-1" />
                Copy Caption
              </Button>
            </div>
            
            <div>
              <Label>Hashtags</Label>
              <div className="bg-gray-50 p-3 rounded border">
                <p className="text-sm">
                  {carousel.hashtags.map(tag => `#${tag}`).join(' ')}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={() => copyToClipboard(carousel.hashtags.map(tag => `#${tag}`).join(' '))}
              >
                <Copy className="h-3 w-3 mr-1" />
                Copy Hashtags
              </Button>
            </div>

            <div>
              <Label>Images ({carousel.images.length})</Label>
              <div className="grid grid-cols-5 gap-2 mt-2">
                {carousel.images.map((image, index) => (
                  <div key={index} className="aspect-square bg-gray-100 rounded border flex items-center justify-center">
                    <span className="text-xs text-gray-500">{index + 1}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}