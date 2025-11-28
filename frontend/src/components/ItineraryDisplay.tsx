import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
    Calendar,
    MapPin,
    DollarSign,
    Sun,
    CloudRain,
    Thermometer,
    Info,
    Utensils,
    Bed,
    Car,
    Camera,
    AlertTriangle,
    Bus,
    Wallet,
    Wifi,
    Ticket
} from "lucide-react";
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";

export interface ItineraryData {
    trip_title: string;
    duration_days: number;
    budget_per_person: number;
    season: string;
    group_type: string;
    highlights: string[];
    weather_advisory: {
        expected_weather: string;
        packing_tips: string[];
        risks: string[];
        seasonal_highlights: string[];
    };
    day_by_day_itinerary: {
        day: number;
        title: string;
        activities: string[];
        stay_recommendations: string[];
        transport: string[];
        food_spots: string[];
        pro_tip: string[];
        permit_required: boolean;
    }[];
    budget_breakdown: {
        accommodation: number;
        food_and_drinks: number;
        activities_and_entry: number;
        local_transport: number;
        miscellaneous_buffer: number;
        total: number;
    };
    local_transport: {
        walking: string;
        auto_rickshaw: string;
        local_buses: string;
        shared_cabs: string;
        tips: string[];
    };
    footnotes_safety_tips: {
        cultural_etiquette: string[];
        safety: string[];
        payment: {
            upi: string;
            cash: string;
        };
        permits: {
            rohtang_pass_required: boolean;
            apply_online: string;
        };
        connectivity: {
            wifi: string;
            mobile_networks: string;
        };
    };
}

interface ItineraryDisplayProps {
    data: ItineraryData;
}

const ItineraryDisplay = ({ data }: ItineraryDisplayProps) => {
    // Calculate percentages for budget bars
    const totalBudget = data.budget_breakdown.total;
    const getBudgetPercent = (amount: number) => (amount / totalBudget) * 100;

    return (
        <div className="space-y-8 animate-fade-in max-w-5xl mx-auto">
            {/* Hero Header */}
            <div className="relative rounded-3xl overflow-hidden bg-gradient-hero p-8 text-center space-y-6 shadow-lg border border-white/20">
                <div className="absolute inset-0 bg-white/40 backdrop-blur-sm -z-10" />
                <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent drop-shadow-sm">
                    {data.trip_title}
                </h1>
                <div className="flex flex-wrap justify-center gap-4 text-muted-foreground">
                    <Badge variant="secondary" className="px-4 py-1.5 text-sm flex items-center gap-2 bg-white/80 backdrop-blur shadow-sm">
                        <Calendar className="h-4 w-4 text-primary" /> {data.duration_days} Days
                    </Badge>
                    <Badge variant="secondary" className="px-4 py-1.5 text-sm flex items-center gap-2 bg-white/80 backdrop-blur shadow-sm">
                        <DollarSign className="h-4 w-4 text-green-600" /> ₹{data.budget_per_person}/person
                    </Badge>
                    <Badge variant="secondary" className="px-4 py-1.5 text-sm flex items-center gap-2 bg-white/80 backdrop-blur shadow-sm">
                        <Sun className="h-4 w-4 text-orange-500" /> {data.season}
                    </Badge>
                </div>
            </div>

            <Tabs defaultValue="overview" className="w-full">
                <TabsList className="grid w-full grid-cols-4 h-auto p-1 bg-muted/50 rounded-xl mb-8">
                    <TabsTrigger value="overview" className="py-3 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">Overview</TabsTrigger>
                    <TabsTrigger value="itinerary" className="py-3 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">Itinerary</TabsTrigger>
                    <TabsTrigger value="budget" className="py-3 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">Budget</TabsTrigger>
                    <TabsTrigger value="guide" className="py-3 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">Guide & Safety</TabsTrigger>
                </TabsList>

                {/* OVERVIEW TAB */}
                <TabsContent value="overview" className="space-y-6 animate-fade-in">
                    {/* Highlights */}
                    <Card className="border-none shadow-card bg-gradient-to-br from-white to-primary/5">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-xl">
                                <Camera className="h-6 w-6 text-primary" /> Trip Highlights
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex flex-wrap gap-3">
                                {data.highlights.map((highlight, index) => (
                                    <Badge key={index} variant="outline" className="text-base px-4 py-2 border-primary/20 bg-white/50 hover:bg-white transition-colors">
                                        {highlight}
                                    </Badge>
                                ))}
                            </div>
                        </CardContent>
                    </Card>

                    <div className="grid md:grid-cols-2 gap-6">
                        {/* Weather */}
                        <Card className="shadow-soft hover:shadow-card transition-shadow">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <CloudRain className="h-5 w-5 text-blue-500" /> Weather Forecast
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="bg-blue-50 dark:bg-blue-950/20 p-4 rounded-lg">
                                    <p className="font-medium text-blue-900 dark:text-blue-100">{data.weather_advisory.expected_weather}</p>
                                </div>
                                <div>
                                    <h4 className="font-medium mb-2 text-sm text-muted-foreground">Seasonal Highlights</h4>
                                    <ul className="list-disc list-inside text-sm space-y-1">
                                        {data.weather_advisory.seasonal_highlights.map((item, i) => (
                                            <li key={i}>{item}</li>
                                        ))}
                                    </ul>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Packing */}
                        <Card className="shadow-soft hover:shadow-card transition-shadow">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Bus className="h-5 w-5 text-orange-500" /> Packing Essentials
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <ul className="space-y-2">
                                    {data.weather_advisory.packing_tips.map((tip, i) => (
                                        <li key={i} className="flex items-start gap-2 text-sm">
                                            <span className="h-1.5 w-1.5 rounded-full bg-orange-400 mt-1.5 shrink-0" />
                                            {tip}
                                        </li>
                                    ))}
                                </ul>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                {/* ITINERARY TAB */}
                <TabsContent value="itinerary" className="space-y-6 animate-fade-in">
                    <div className="flex items-center justify-between">
                        <h2 className="text-2xl font-bold">Day by Day Plan</h2>
                        <Badge variant="outline">{data.day_by_day_itinerary.length} Days</Badge>
                    </div>

                    <Accordion type="single" collapsible className="w-full space-y-4">
                        {data.day_by_day_itinerary.map((day, index) => (
                            <AccordionItem key={index} value={`day-${day.day}`} className="border rounded-xl px-4 shadow-sm bg-card">
                                <AccordionTrigger className="hover:no-underline py-4">
                                    <div className="flex items-center gap-4 text-left w-full">
                                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-primary font-bold">
                                            {day.day}
                                        </div>
                                        <div className="flex-1">
                                            <p className="font-semibold text-lg">{day.title}</p>
                                            <p className="text-sm text-muted-foreground line-clamp-1">{day.activities.slice(0, 2).join(", ")}...</p>
                                        </div>
                                    </div>
                                </AccordionTrigger>
                                <AccordionContent className="pb-6 pt-2 space-y-6">
                                    {/* Activities Grid */}
                                    <div className="grid gap-4">
                                        <div className="bg-muted/30 p-4 rounded-lg space-y-3">
                                            <h4 className="font-medium flex items-center gap-2 text-primary">
                                                <MapPin className="h-4 w-4" /> Today's Activities
                                            </h4>
                                            <ul className="space-y-2">
                                                {day.activities.map((activity, i) => (
                                                    <li key={i} className="flex items-start gap-2 text-sm">
                                                        <span className="h-1.5 w-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                                                        {activity}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>

                                        <div className="grid md:grid-cols-2 gap-4">
                                            <div className="bg-orange-50 dark:bg-orange-950/10 p-4 rounded-lg space-y-2">
                                                <h4 className="font-medium flex items-center gap-2 text-orange-600 dark:text-orange-400">
                                                    <Utensils className="h-4 w-4" /> Food & Dining
                                                </h4>
                                                <ul className="space-y-1 text-sm text-muted-foreground">
                                                    {day.food_spots.map((spot, i) => (
                                                        <li key={i}>• {spot}</li>
                                                    ))}
                                                </ul>
                                            </div>

                                            <div className="bg-blue-50 dark:bg-blue-950/10 p-4 rounded-lg space-y-2">
                                                <h4 className="font-medium flex items-center gap-2 text-blue-600 dark:text-blue-400">
                                                    <Bed className="h-4 w-4" /> Where to Stay
                                                </h4>
                                                <ul className="space-y-1 text-sm text-muted-foreground">
                                                    {day.stay_recommendations.map((stay, i) => (
                                                        <li key={i}>• {stay}</li>
                                                    ))}
                                                </ul>
                                            </div>
                                        </div>

                                        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground border-t pt-4">
                                            <div className="flex items-center gap-2">
                                                <Car className="h-4 w-4" />
                                                <span>{day.transport.join(", ")}</span>
                                            </div>
                                            {day.permit_required && (
                                                <div className="flex items-center gap-2 text-amber-600">
                                                    <Ticket className="h-4 w-4" />
                                                    <span>Permit Required</span>
                                                </div>
                                            )}
                                        </div>

                                        {day.pro_tip && day.pro_tip.length > 0 && (
                                            <div className="bg-accent/10 border border-accent/20 p-3 rounded-lg flex gap-3 items-start">
                                                <Info className="h-5 w-5 text-accent shrink-0 mt-0.5" />
                                                <div>
                                                    <p className="font-medium text-sm text-accent-foreground">Pro Tip</p>
                                                    <p className="text-sm text-muted-foreground">{day.pro_tip[0]}</p>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </AccordionContent>
                            </AccordionItem>
                        ))}
                    </Accordion>
                </TabsContent>

                {/* BUDGET TAB */}
                <TabsContent value="budget" className="space-y-6 animate-fade-in">
                    <div className="grid md:grid-cols-3 gap-6">
                        <Card className="md:col-span-2 shadow-card">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Wallet className="h-5 w-5 text-green-600" /> Estimated Breakdown
                                </CardTitle>
                                <CardDescription>Based on a total budget of ₹{data.budget_breakdown.total}</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="space-y-2">
                                    <div className="flex justify-between text-sm font-medium">
                                        <span>Accommodation</span>
                                        <span>₹{data.budget_breakdown.accommodation}</span>
                                    </div>
                                    <Progress value={getBudgetPercent(data.budget_breakdown.accommodation)} className="h-2" />
                                </div>

                                <div className="space-y-2">
                                    <div className="flex justify-between text-sm font-medium">
                                        <span>Food & Drinks</span>
                                        <span>₹{data.budget_breakdown.food_and_drinks}</span>
                                    </div>
                                    <Progress value={getBudgetPercent(data.budget_breakdown.food_and_drinks)} className="h-2 bg-secondary" />
                                </div>

                                <div className="space-y-2">
                                    <div className="flex justify-between text-sm font-medium">
                                        <span>Activities</span>
                                        <span>₹{data.budget_breakdown.activities_and_entry}</span>
                                    </div>
                                    <Progress value={getBudgetPercent(data.budget_breakdown.activities_and_entry)} className="h-2 bg-secondary" />
                                </div>

                                <div className="space-y-2">
                                    <div className="flex justify-between text-sm font-medium">
                                        <span>Transport</span>
                                        <span>₹{data.budget_breakdown.local_transport}</span>
                                    </div>
                                    <Progress value={getBudgetPercent(data.budget_breakdown.local_transport)} className="h-2 bg-secondary" />
                                </div>

                                <div className="pt-4 border-t mt-4">
                                    <div className="flex justify-between items-center">
                                        <span className="font-bold text-lg">Total Estimated Cost</span>
                                        <span className="font-bold text-2xl text-primary">₹{data.budget_breakdown.total}</span>
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-2 text-right">*Prices are approximate and subject to change</p>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="bg-green-50 dark:bg-green-950/10 border-green-100 dark:border-green-900">
                            <CardHeader>
                                <CardTitle className="text-lg text-green-800 dark:text-green-400">Payment Tips</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div>
                                    <h4 className="font-medium text-sm mb-1">UPI / Digital</h4>
                                    <p className="text-sm text-muted-foreground">{data.footnotes_safety_tips.payment.upi}</p>
                                </div>
                                <div>
                                    <h4 className="font-medium text-sm mb-1">Cash</h4>
                                    <p className="text-sm text-muted-foreground">{data.footnotes_safety_tips.payment.cash}</p>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                {/* GUIDE TAB */}
                <TabsContent value="guide" className="space-y-6 animate-fade-in">
                    <div className="grid md:grid-cols-2 gap-6">
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Bus className="h-5 w-5 text-primary" /> Local Transport
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-muted/30 p-3 rounded-lg">
                                        <p className="text-xs font-medium text-muted-foreground uppercase">Walking</p>
                                        <p className="text-sm">{data.local_transport.walking}</p>
                                    </div>
                                    <div className="bg-muted/30 p-3 rounded-lg">
                                        <p className="text-xs font-medium text-muted-foreground uppercase">Auto/Cab</p>
                                        <p className="text-sm">{data.local_transport.auto_rickshaw}</p>
                                    </div>
                                </div>
                                <div>
                                    <h4 className="font-medium text-sm mb-2">Transport Tips</h4>
                                    <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                                        {data.local_transport.tips.map((tip, i) => (
                                            <li key={i}>{tip}</li>
                                        ))}
                                    </ul>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="border-orange-200 bg-orange-50 dark:bg-orange-950/10 dark:border-orange-900">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-orange-700 dark:text-orange-400">
                                    <AlertTriangle className="h-5 w-5" /> Safety & Etiquette
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div>
                                    <h4 className="font-medium text-sm mb-2">Safety First</h4>
                                    <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                                        {data.footnotes_safety_tips.safety.map((tip, i) => (
                                            <li key={i}>{tip}</li>
                                        ))}
                                    </ul>
                                </div>
                                <div>
                                    <h4 className="font-medium text-sm mb-2">Cultural Notes</h4>
                                    <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                                        {data.footnotes_safety_tips.cultural_etiquette.map((tip, i) => (
                                            <li key={i}>{tip}</li>
                                        ))}
                                    </ul>
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Wifi className="h-5 w-5 text-blue-500" /> Connectivity
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex justify-between items-center border-b pb-2">
                                    <span className="text-sm font-medium">WiFi Availability</span>
                                    <span className="text-sm text-muted-foreground">{data.footnotes_safety_tips.connectivity.wifi}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm font-medium">Mobile Networks</span>
                                    <span className="text-sm text-muted-foreground">{data.footnotes_safety_tips.connectivity.mobile_networks}</span>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
};

export default ItineraryDisplay;
