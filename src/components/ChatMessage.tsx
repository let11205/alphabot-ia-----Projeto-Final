import { Card } from "@/components/ui/card";
import { Bot, User } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  isLoading?: boolean;
}

const formatBotMessage = (text: string): string => {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold">$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, '<ul class="list-disc ml-4 mb-2 space-y-1">$&</ul>')
    .replace(/\n\n/g, '</p><p class="mb-2">')
    .replace(/^(.+)$/gm, (match) => {
      if (match.startsWith('<') || match.trim() === '') return match;
      return `<p class="mb-2">${match}</p>`;
    });
};

const ChatMessage = ({ role, content, isLoading }: ChatMessageProps) => {
  const isBot = role === "assistant";

  return (
    <div className={cn("flex gap-3", isBot ? "justify-start" : "justify-end")}>
      {isBot && (
        <div className="w-8 h-8 rounded-full bg-gradient-accent flex items-center justify-center flex-shrink-0 shadow-glow">
          <Bot className="w-5 h-5" />
        </div>
      )}
      <Card
        className={cn(
          "max-w-[80%] p-4 transition-all",
          isBot
            ? "bg-gradient-card backdrop-blur-xl border-border/50"
            : "bg-primary text-primary-foreground shadow-glow border-primary"
        )}
      >
        <div 
          className="text-sm leading-relaxed formatted-content"
          dangerouslySetInnerHTML={
            isLoading 
              ? undefined 
              : isBot 
                ? { __html: formatBotMessage(content) } 
                : undefined
          }
        >
          {isLoading && (
            <span className="inline-flex gap-1">
              <span className="animate-pulse">●</span>
              <span className="animate-pulse delay-100">●</span>
              <span className="animate-pulse delay-200">●</span>
            </span>
          )}
          {!isLoading && !isBot && <span className="whitespace-pre-wrap">{content}</span>}
        </div>
      </Card>
      {!isBot && (
        <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
          <User className="w-5 h-5" />
        </div>
      )}
    </div>
  );
};

export default ChatMessage;
