import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { FileSpreadsheet, Sparkles, TrendingUp, ArrowRight, LogIn } from "lucide-react";

const Index = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-gradient-primary flex flex-col items-center justify-center px-4">
      <div className="max-w-4xl mx-auto text-center space-y-8">
        {/* Logo and Title */}
        <div className="space-y-4 animate-fade-in">
          <h1 className="text-6xl font-bold tracking-tight">
            Alphabot IA
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Transforme suas planilhas de vendas em insights incríveis com
            inteligência artificial avançada
          </p>
        </div>

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-4 my-12">
          <div className="p-6 rounded-2xl bg-gradient-card backdrop-blur-xl border border-border/50 hover:border-primary/50 transition-all">
            <Sparkles className="w-8 h-8 text-primary mb-3" />
            <h3 className="font-semibold mb-2">IA Avançada</h3>
            <p className="text-sm text-muted-foreground">
              Powered by Gemini 2.5 Pro para análises precisas
            </p>
          </div>
          <div className="p-6 rounded-2xl bg-gradient-card backdrop-blur-xl border border-border/50 hover:border-primary/50 transition-all">
            <FileSpreadsheet className="w-8 h-8 text-primary mb-3" />
            <h3 className="font-semibold mb-2">Upload Simples</h3>
            <p className="text-sm text-muted-foreground">
              Arraste e solte suas planilhas CSV ou Excel
            </p>
          </div>
          <div className="p-6 rounded-2xl bg-gradient-card backdrop-blur-xl border border-border/50 hover:border-primary/50 transition-all">
            <TrendingUp className="w-8 h-8 text-primary mb-3" />
            <h3 className="font-semibold mb-2">Insights Incríveis</h3>
            <p className="text-sm text-muted-foreground">
              Análises profundas e visualizações impactantes
            </p>
          </div>
        </div>

        {/* CTA Button */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          {user ? (
            <Button
              size="lg"
              onClick={() => navigate("/chat")}
              className="bg-gradient-accent hover:opacity-90 transition-all shadow-glow text-lg px-8 py-6 h-auto group"
            >
              Ir para o Chat
              <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Button>
          ) : (
            <>
              <Button
                size="lg"
                onClick={() => navigate("/auth")}
                className="bg-gradient-accent hover:opacity-90 transition-all shadow-glow text-lg px-8 py-6 h-auto group"
              >
                <LogIn className="w-5 h-5 mr-2" />
                Entrar
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => navigate("/auth")}
                className="text-lg px-8 py-6 h-auto"
              >
                Criar Conta
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Index;
