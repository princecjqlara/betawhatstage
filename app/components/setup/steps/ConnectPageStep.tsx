'use client';

interface ConnectPageStepProps {
    onNext: (data: Record<string, string | undefined>) => void;
    isLoading: boolean;
    initialData?: Record<string, string | undefined>;
}

export default function ConnectPageStep({ onNext, isLoading }: ConnectPageStepProps) {

    const handleFinish = () => {
        onNext({});
    };

    return (
        <div className="flex flex-col h-full justify-between text-center">
            <div className="space-y-8 flex flex-col items-center justify-center flex-1">

                <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center animate-bounce">
                    <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                </div>

                <div>
                    <h3 className="text-2xl font-extrabold text-[#112D29]">All Set!</h3>
                    <p className="text-gray-500 mt-2 max-w-xs mx-auto">
                        Your AI assistant is configured and ready to take over.
                    </p>
                </div>

                <div className="w-full max-w-sm">
                    <button
                        className="w-full py-3 bg-[#1877F2] text-white rounded-xl font-bold hover:bg-[#166fe5] shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-3 mb-3 group"
                        onClick={() => alert("FB OAuth")}
                    >
                        <span className="bg-white/20 p-1 rounded group-hover:bg-white/30 transition-colors">
                            <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.791-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                            </svg>
                        </span>
                        Connect Facebook Page
                    </button>
                    <p className="text-xs text-gray-400">
                        Required to reply to your customers.
                    </p>
                </div>
            </div>

            <div className="pt-6">
                <button
                    onClick={handleFinish}
                    disabled={isLoading}
                    className="w-full py-4 border-2 border-gray-100 text-gray-600 bg-white hover:border-gray-300 hover:text-gray-800 rounded-xl font-bold transition-all duration-200"
                >
                    {isLoading ? 'Finishing...' : 'Skip for now'}
                </button>
            </div>
        </div>
    );
}
