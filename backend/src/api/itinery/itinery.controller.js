import { main } from "../../../aiservice/ai-service.js";
import { buildprompttext } from "../../../aiservice/prompt.js";
import Trip from "../../../models/Trip.js";

export const generateItinerary = async (req, res) => {
    try {
        const prompt = req.body;
        if (!prompt) {
            return res.status(400).json({ message: "Prompt is required" });
        }

        const buildprompt = buildprompttext(prompt);
        const response = await main(buildprompt);

        const cleanedData = response
            .replace(/```json/g, '')
            .replace(/```/g, '')
            .trim();

        console.log("AI Response:", cleanedData);

        try {
            const jsonData = JSON.parse(cleanedData);

            // Save to Database
            const trip = new Trip({
                userId: req.userId,
                tripDetails: jsonData
            });
            await trip.save();

            res.json(trip); // Return the whole trip object including _id
        } catch (parseError) {
            console.error("JSON Parse Error:", parseError);
            res.status(500).json({ message: "Failed to parse AI response", raw: cleanedData });
        }
    } catch (error) {
        console.error("Itinerary Generation Error:", error);
        res.status(500).json({ message: error.message });
    }
}

export const getUserTrips = async (req, res) => {
    try {
        const trips = await Trip.find({ userId: req.userId }).sort({ createdAt: -1 });
        res.json(trips);
    } catch (error) {
        console.error("Error fetching trips:", error);
        res.status(500).json({ message: "Failed to fetch trips" });
    }
};